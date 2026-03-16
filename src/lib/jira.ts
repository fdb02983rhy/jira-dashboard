import { buildTree } from "@/lib/tree";
import type {
	Activity,
	DateRange,
	IssueMapEntry,
	JiraProject,
	JiraUser,
	MemberCount,
	StaleIssue,
	TreeNode,
} from "@/types";

// ─── Generic Jira Fetch (proxy) ─────────────────────
// Used only for connection test + project list

export async function jiraFetch<T = unknown>(
	path: string,
	options: { method?: string; body?: unknown } = {},
): Promise<T> {
	const proxyUrl = `/jira${path}`;
	const res = await fetch(proxyUrl, {
		method: options.method || "GET",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: options.body ? JSON.stringify(options.body) : undefined,
	});

	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(
			`Jira API error: ${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`,
		);
	}
	return res.json();
}

// ─── Test Connection ────────────────────────────────

export async function testConnection(): Promise<JiraUser> {
	return jiraFetch<JiraUser>("/rest/api/3/myself");
}

// ─── Fetch Projects ─────────────────────────────────

export async function fetchProjects(): Promise<JiraProject[]> {
	return jiraFetch<JiraProject[]>("/rest/api/3/project?expand=lead&recent=20");
}

// ─── Fetch Project Members (via server cache) ───────

export async function fetchProjectMembers(
	projectKey: string,
): Promise<Record<string, MemberCount>> {
	const res = await fetch(`/api/members/${projectKey}`);
	if (!res.ok) throw new Error("Failed to fetch members");
	const data: { members: string[] } = await res.json();

	const map: Record<string, MemberCount> = {};
	for (const name of data.members) {
		map[name] = { name, count: 0 };
	}
	return map;
}

// ─── Fetch Activity Data (via server cache + delta) ──

interface ServerActivity {
	id: string;
	project: string;
	issue_key: string;
	issue_summary: string;
	issue_type: string;
	field: string;
	field_category: string;
	from_val: string;
	to_val: string;
	author: string;
	author_id: string;
	timestamp: number;
}

interface ServerIssue {
	key: string;
	project: string;
	summary: string;
	type: string;
	parent_key: string | null;
	status: string;
	assignee: string;
}

export interface ActivityDataResult {
	activities: Activity[];
	issueTree: TreeNode[];
	memberCounts: MemberCount[];
	allMembers: Record<string, MemberCount>;
}

export async function fetchActivityData(
	projectKey: string,
	dateRange: DateRange,
	existingMembers: Record<string, MemberCount> = {},
	options?: { force?: boolean },
): Promise<ActivityDataResult> {
	const startStr = dateRange.start.toISOString().split("T")[0];
	const endStr = dateRange.end.toISOString().split("T")[0];

	const res = await fetch("/api/activities", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			project: projectKey,
			start: startStr,
			end: endStr,
			force: options?.force ?? false,
		}),
	});

	if (!res.ok) {
		const data = await res.json().catch(() => ({ error: "Request failed" }));
		throw new Error(
			(data as { error?: string }).error || "Failed to fetch activities",
		);
	}

	const data: { activities: ServerActivity[]; issues: ServerIssue[] } =
		await res.json();

	// Convert server activities → frontend Activity type
	const validCategories = new Set<string>([
		"status",
		"assignee",
		"date",
		"comment",
	]);
	const activities: Activity[] = data.activities.map((a) => ({
		id: a.id,
		issueKey: a.issue_key,
		issueSummary: a.issue_summary,
		issueType: a.issue_type,
		field: a.field,
		fieldCategory: (validCategories.has(a.field_category)
			? a.field_category
			: "other") as Activity["fieldCategory"],
		from: a.from_val,
		to: a.to_val,
		author: a.author,
		authorId: a.author_id,
		timestamp: new Date(a.timestamp),
	}));

	// Sort by timestamp descending
	activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

	// Build issue map for tree
	const issueMap: Record<string, IssueMapEntry> = {};
	for (const issue of data.issues) {
		issueMap[issue.key] = {
			key: issue.key,
			summary: issue.summary,
			type: issue.type,
			parentKey: issue.parent_key,
			parentSummary: null,
			status: issue.status,
			assignee: issue.assignee,
			changes: [],
		};
	}

	// Attach activities to their issues
	for (const act of activities) {
		issueMap[act.issueKey]?.changes.push(act);
	}

	// Merge activity counts with known members
	const memberMap: Record<string, MemberCount> = { ...existingMembers };
	for (const m of Object.values(memberMap)) {
		m.count = 0;
	}
	for (const a of activities) {
		const member = memberMap[a.author];
		if (member) member.count++;
	}

	const memberCounts = Object.values(memberMap).sort((a, b) => {
		if (a.count > 0 && b.count === 0) return -1;
		if (a.count === 0 && b.count > 0) return 1;
		if (a.count !== b.count) return b.count - a.count;
		return a.name.localeCompare(b.name);
	});

	const issueTree = buildTree(issueMap);

	return { activities, issueTree, memberCounts, allMembers: memberMap };
}

// ─── Fetch Stale Issues (assigned, not updated in range) ──

export async function fetchStaleIssues(
	projectKey: string,
	member: string,
	beforeDate: string,
): Promise<StaleIssue[]> {
	const res = await fetch(
		`/api/stale-issues/${projectKey}?member=${encodeURIComponent(member)}&before=${encodeURIComponent(beforeDate)}`,
	);
	if (!res.ok) {
		const data = await res.json().catch(() => ({ error: "Request failed" }));
		throw new Error(
			(data as { error?: string }).error || "Failed to fetch stale issues",
		);
	}
	const data: { issues: StaleIssue[] } = await res.json();
	return data.issues;
}

// ─── Fetch Stale Counts (summary per member) ────────

export async function fetchStaleCounts(
	projectKey: string,
	beforeDate: string,
): Promise<{ member: string; count: number }[]> {
	const res = await fetch(
		`/api/stale-counts/${projectKey}?before=${encodeURIComponent(beforeDate)}`,
	);
	if (!res.ok) {
		const data = await res.json().catch(() => ({ error: "Request failed" }));
		throw new Error(
			(data as { error?: string }).error || "Failed to fetch stale counts",
		);
	}
	const data: { counts: { member: string; count: number }[] } =
		await res.json();
	return data.counts;
}

// ─── Fetch Unassigned Issues ────────────────────────

export async function fetchUnassignedIssues(
	projectKey: string,
): Promise<import("@/types").UnassignedIssue[]> {
	const res = await fetch(`/api/unassigned-issues/${projectKey}`);
	if (!res.ok) {
		const data = await res.json().catch(() => ({ error: "Request failed" }));
		throw new Error(
			(data as { error?: string }).error || "Failed to fetch unassigned issues",
		);
	}
	const data: { issues: import("@/types").UnassignedIssue[] } =
		await res.json();
	return data.issues;
}
