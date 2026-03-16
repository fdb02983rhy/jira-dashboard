import type { DbActivity, DbIssue } from "./db.ts";

// ── Env ─────────────────────────────────────────────────────

const env = {
	url: (process.env.ATLASSIAN_URL || "").replace(/\/+$/, ""),
	email: process.env.ATLASSIAN_USERNAME || "",
	token: process.env.ATLASSIAN_API_TOKEN || "",
};

// ── Tracked Fields ──────────────────────────────────────────

const TRACKED_FIELDS = [
	"status",
	"assignee",
	"Start date",
	"Due date",
	"duedate",
	"customfield_10015",
];

const FIELD_DISPLAY: Record<string, string> = {
	status: "Status",
	assignee: "Assignee",
	"Start date": "Start Date",
	"Due date": "Due Date",
	duedate: "Due Date",
	customfield_10015: "Start Date",
};

function fieldCategory(
	fieldId: string,
): "status" | "assignee" | "date" | "comment" | "other" {
	if (fieldId === "status") return "status";
	if (fieldId === "assignee") return "assignee";
	if (
		fieldId === "duedate" ||
		fieldId === "Due date" ||
		fieldId === "Start date" ||
		fieldId === "customfield_10015"
	)
		return "date";
	return "other";
}

// ── ADF Text Extraction ─────────────────────────────────────

interface AdfNode {
	type: string;
	text?: string;
	attrs?: Record<string, unknown>;
	content?: AdfNode[];
}

function extractAdfText(node: AdfNode | string | null | undefined): string {
	if (!node) return "";
	if (typeof node === "string") return node;
	if (node.type === "text") return node.text || "";
	if (node.type === "mention") return `@${node.attrs?.text || "someone"}`;
	if (node.type === "hardBreak") return " ";
	if (Array.isArray(node.content))
		return node.content.map(extractAdfText).join("");
	return "";
}

// ── Generic Jira Fetch (server-side, direct auth) ───────────

async function jiraFetch<T = unknown>(
	path: string,
	options: { method?: string; body?: unknown } = {},
): Promise<T> {
	const url = `${env.url}${path}`;
	const auth = `Basic ${btoa(`${env.email}:${env.token}`)}`;

	const res = await fetch(url, {
		method: options.method || "GET",
		headers: {
			Authorization: auth,
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

// ── Jira API Types (minimal) ────────────────────────────────

interface JiraUser {
	accountId: string;
	displayName: string;
}

interface JiraSearchResponse {
	issues: Array<{
		key: string;
		fields: {
			summary: string;
			status?: { name: string };
			assignee?: { displayName: string; accountId: string } | null;
			issuetype?: { name: string };
			parent?: { key: string };
			updated?: string;
			comment?: {
				comments: Array<{
					id: string;
					author?: JiraUser;
					body?: AdfNode;
					created: string;
				}>;
			};
		};
	}>;
	nextPageToken?: string;
	isLast?: boolean;
}

interface JiraChangelog {
	values: Array<{
		id: string;
		author?: JiraUser;
		created: string;
		items: Array<{
			field: string;
			fieldId?: string;
			fromString?: string | null;
			toString?: string | null;
			from?: string | null;
			to?: string | null;
		}>;
	}>;
}

// ── Project Key Validation ──────────────────────────────────

const PROJECT_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,19}$/;

export function isValidProjectKey(key: string): boolean {
	return PROJECT_KEY_RE.test(key);
}

// ── Fetch & Process Activities ──────────────────────────────

export interface FetchResult {
	activities: DbActivity[];
	issues: DbIssue[];
	changedIssueKeys: string[];
}

export async function fetchActivitiesFromJira(
	project: string,
	startDate: string,
	endDate: string,
	sinceDate?: string,
): Promise<FetchResult> {
	if (!isValidProjectKey(project)) {
		throw new Error(`Invalid project key: ${project}`);
	}
	const startMs = new Date(startDate).getTime();
	const endNext = new Date(endDate);
	endNext.setDate(endNext.getDate() + 1);
	const endMs = endNext.getTime();
	const endStr = endNext.toISOString().split("T")[0] as string;

	// Build JQL — if sinceDate provided, only fetch issues updated since then (delta)
	const updatedSince = sinceDate || startDate;
	const jql = `project = "${project}" AND updated >= "${updatedSince}" AND updated < "${endStr}" ORDER BY updated DESC`;

	// Paginate issues
	let allIssues: JiraSearchResponse["issues"] = [];
	let nextPageToken: string | null = null;
	while (allIssues.length < 200) {
		const body: Record<string, unknown> = {
			jql,
			maxResults: 50,
			fields: [
				"summary",
				"status",
				"assignee",
				"issuetype",
				"parent",
				"comment",
			],
		};
		if (nextPageToken) body.nextPageToken = nextPageToken;

		const data = await jiraFetch<JiraSearchResponse>("/rest/api/3/search/jql", {
			method: "POST",
			body,
		});
		allIssues = allIssues.concat(data.issues || []);

		if (data.isLast || !data.nextPageToken || data.issues.length === 0) break;
		nextPageToken = data.nextPageToken;
	}

	const activities: DbActivity[] = [];
	const issues: DbIssue[] = [];
	const changedIssueKeys: string[] = [];

	for (const issue of allIssues) {
		changedIssueKeys.push(issue.key);

		issues.push({
			key: issue.key,
			project,
			summary: issue.fields.summary,
			type: issue.fields.issuetype?.name?.toLowerCase() || "task",
			parent_key: issue.fields.parent?.key || null,
			status: issue.fields.status?.name || "",
			assignee: issue.fields.assignee?.displayName || "Unassigned",
		});

		// Fetch changelog
		try {
			const changelog = await jiraFetch<JiraChangelog>(
				`/rest/api/3/issue/${issue.key}/changelog`,
			);

			for (const history of changelog.values || []) {
				const histMs = new Date(history.created).getTime();
				if (histMs < startMs || histMs >= endMs) continue;

				for (const item of history.items) {
					if (
						TRACKED_FIELDS.includes(item.field) ||
						(item.fieldId && TRACKED_FIELDS.includes(item.fieldId))
					) {
						const cat = fieldCategory(item.fieldId || item.field);
						activities.push({
							id: `${issue.key}-${history.id}-${item.fieldId || item.field}`,
							project,
							issue_key: issue.key,
							issue_summary: issue.fields.summary,
							issue_type: issue.fields.issuetype?.name?.toLowerCase() || "task",
							field:
								FIELD_DISPLAY[item.fieldId || ""] ||
								FIELD_DISPLAY[item.field] ||
								item.field,
							field_category: cat,
							from_val: item.fromString || item.from || "(none)",
							to_val: item.toString || item.to || "(none)",
							author: history.author?.displayName || "Unknown",
							author_id: history.author?.accountId || "",
							timestamp: histMs,
						});
					}
				}
			}
		} catch (e: unknown) {
			console.warn(`Changelog fetch failed for ${issue.key}:`, e);
		}

		// Comments
		const comments = issue.fields.comment?.comments || [];
		for (const c of comments) {
			const cMs = new Date(c.created).getTime();
			if (cMs < startMs || cMs >= endMs) continue;

			activities.push({
				id: `${issue.key}-comment-${c.id}`,
				project,
				issue_key: issue.key,
				issue_summary: issue.fields.summary,
				issue_type: issue.fields.issuetype?.name?.toLowerCase() || "task",
				field: "Comment",
				field_category: "comment",
				from_val: "",
				to_val: extractAdfText(c.body).substring(0, 150) || "Comment added",
				author: c.author?.displayName || "Unknown",
				author_id: c.author?.accountId || "",
				timestamp: cMs,
			});
		}
	}

	return { activities, issues, changedIssueKeys };
}

// ── Fetch Project Members ───────────────────────────────────

interface JiraProject {
	roles?: Record<string, string>;
}

interface JiraRole {
	actors?: Array<{
		type: string;
		displayName?: string;
	}>;
}

export async function fetchMembersFromJira(project: string): Promise<string[]> {
	if (!isValidProjectKey(project)) {
		throw new Error(`Invalid project key: ${project}`);
	}
	const names = new Set<string>();

	try {
		const projectData = await jiraFetch<JiraProject>(
			`/rest/api/3/project/${project}`,
		);

		for (const [roleName, roleUrl] of Object.entries(projectData.roles || {})) {
			if (roleName === "atlassian-addons-project-access") continue;
			try {
				const parsed = new URL(roleUrl);
				const roleData = await jiraFetch<JiraRole>(
					`${parsed.pathname}?excludeInactiveUsers=true`,
				);
				for (const actor of roleData.actors || []) {
					if (actor.type === "atlassian-user-role-actor" && actor.displayName) {
						names.add(actor.displayName);
					}
				}
			} catch (_e: unknown) {
				// skip inaccessible roles
			}
		}
	} catch (e: unknown) {
		console.warn("Failed to fetch members:", e);
	}

	return [...names].sort();
}

// ── Fetch Stale Issues (assigned but not updated in range) ──

export interface StaleIssue {
	key: string;
	summary: string;
	type: string;
	status: string;
	assignee: string;
	parent_key: string | null;
	updated: number; // epoch ms
	is_context: boolean; // true = parent shown for tree context, not actually stale
}

export async function fetchStaleIssuesFromJira(
	project: string,
	member: string,
	beforeDate: string,
): Promise<StaleIssue[]> {
	if (!isValidProjectKey(project)) {
		throw new Error(`Invalid project key: ${project}`);
	}

	// Escape member name for JQL — backslashes, quotes, and special JQL chars
	const escapedMember = member.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	const jql = `project = "${project}" AND assignee = "${escapedMember}" AND updated < "${beforeDate}" AND statusCategory != Done ORDER BY updated ASC`;

	const data = await jiraFetch<JiraSearchResponse>("/rest/api/3/search/jql", {
		method: "POST",
		body: {
			jql,
			maxResults: 50,
			fields: [
				"summary",
				"status",
				"assignee",
				"issuetype",
				"parent",
				"updated",
			],
		},
	});

	const staleIssues: StaleIssue[] = (data.issues || []).map((issue) => ({
		key: issue.key,
		summary: issue.fields.summary,
		type: issue.fields.issuetype?.name?.toLowerCase() || "task",
		status: issue.fields.status?.name || "",
		assignee: issue.fields.assignee?.displayName || member,
		parent_key: issue.fields.parent?.key || null,
		updated: new Date(issue.fields.updated || 0).getTime(),
		is_context: false,
	}));

	// Walk up the parent chain to fetch all ancestors for tree context
	const knownKeys = new Set(staleIssues.map((i) => i.key));
	const MAX_DEPTH = 5;

	for (let depth = 0; depth < MAX_DEPTH; depth++) {
		const missingParentKeys = [
			...new Set(
				staleIssues
					.map((i) => i.parent_key)
					.filter((k): k is string => k !== null && !knownKeys.has(k)),
			),
		];

		if (missingParentKeys.length === 0) break;

		try {
			const parentJql = `key in (${missingParentKeys.map((k) => `"${k}"`).join(",")})`;
			const parentData = await jiraFetch<JiraSearchResponse>(
				"/rest/api/3/search/jql",
				{
					method: "POST",
					body: {
						jql: parentJql,
						maxResults: missingParentKeys.length,
						fields: ["summary", "status", "issuetype", "parent", "updated"],
					},
				},
			);
			for (const issue of parentData.issues || []) {
				knownKeys.add(issue.key);
				staleIssues.push({
					key: issue.key,
					summary: issue.fields.summary,
					type: issue.fields.issuetype?.name?.toLowerCase() || "task",
					status: issue.fields.status?.name || "",
					assignee: issue.fields.assignee?.displayName || "",
					parent_key: issue.fields.parent?.key || null,
					updated: new Date(issue.fields.updated || 0).getTime(),
					is_context: true,
				});
			}
		} catch (e: unknown) {
			console.warn("[stale] Failed to fetch parent context issues:", e);
			break;
		}
	}

	return staleIssues;
}

// ── Fetch Stale Issue Counts (grouped by assignee) ──

export interface StaleCountResult {
	member: string;
	count: number;
}

export async function fetchStaleCountsFromJira(
	project: string,
	beforeDate: string,
): Promise<StaleCountResult[]> {
	if (!isValidProjectKey(project)) {
		throw new Error(`Invalid project key: ${project}`);
	}

	const jql = `project = "${project}" AND assignee IS NOT EMPTY AND updated < "${beforeDate}" AND statusCategory != Done ORDER BY assignee ASC`;

	let allIssues: JiraSearchResponse["issues"] = [];
	let nextPageToken: string | null = null;
	while (allIssues.length < 200) {
		const body: Record<string, unknown> = {
			jql,
			maxResults: 50,
			fields: ["assignee"],
		};
		if (nextPageToken) body.nextPageToken = nextPageToken;

		const data = await jiraFetch<JiraSearchResponse>("/rest/api/3/search/jql", {
			method: "POST",
			body,
		});
		allIssues = allIssues.concat(data.issues || []);

		if (data.isLast || !data.nextPageToken || data.issues.length === 0) break;
		nextPageToken = data.nextPageToken;
	}

	// Group by assignee
	const counts = new Map<string, number>();
	for (const issue of allIssues) {
		const name = issue.fields.assignee?.displayName || "Unknown";
		counts.set(name, (counts.get(name) || 0) + 1);
	}

	return [...counts.entries()]
		.map(([member, count]) => ({ member, count }))
		.sort((a, b) => b.count - a.count);
}

// ── Fetch Unassigned Issues ─────────────────────────

export interface UnassignedIssueResult {
	key: string;
	summary: string;
	type: string;
	status: string;
	parent_key: string | null;
	updated: number;
	is_context: boolean;
}

export async function fetchUnassignedIssuesFromJira(
	project: string,
): Promise<UnassignedIssueResult[]> {
	if (!isValidProjectKey(project)) {
		throw new Error(`Invalid project key: ${project}`);
	}

	const jql = `project = "${project}" AND assignee IS EMPTY AND statusCategory != Done ORDER BY updated ASC`;

	const data = await jiraFetch<JiraSearchResponse>("/rest/api/3/search/jql", {
		method: "POST",
		body: {
			jql,
			maxResults: 50,
			fields: ["summary", "status", "issuetype", "parent", "updated"],
		},
	});

	const issues: UnassignedIssueResult[] = (data.issues || []).map((issue) => ({
		key: issue.key,
		summary: issue.fields.summary,
		type: issue.fields.issuetype?.name?.toLowerCase() || "task",
		status: issue.fields.status?.name || "",
		parent_key: issue.fields.parent?.key || null,
		updated: new Date(issue.fields.updated || 0).getTime(),
		is_context: false,
	}));

	// Walk up parent chain for tree context (same pattern as stale issues)
	const knownKeys = new Set(issues.map((i) => i.key));
	const MAX_DEPTH = 5;

	for (let depth = 0; depth < MAX_DEPTH; depth++) {
		const missingParentKeys = [
			...new Set(
				issues
					.map((i) => i.parent_key)
					.filter((k): k is string => k !== null && !knownKeys.has(k)),
			),
		];

		if (missingParentKeys.length === 0) break;

		try {
			const parentJql = `key in (${missingParentKeys.map((k) => `"${k}"`).join(",")})`;
			const parentData = await jiraFetch<JiraSearchResponse>(
				"/rest/api/3/search/jql",
				{
					method: "POST",
					body: {
						jql: parentJql,
						maxResults: missingParentKeys.length,
						fields: ["summary", "status", "issuetype", "parent", "updated"],
					},
				},
			);
			for (const issue of parentData.issues || []) {
				knownKeys.add(issue.key);
				issues.push({
					key: issue.key,
					summary: issue.fields.summary,
					type: issue.fields.issuetype?.name?.toLowerCase() || "task",
					status: issue.fields.status?.name || "",
					parent_key: issue.fields.parent?.key || null,
					updated: new Date(issue.fields.updated || 0).getTime(),
					is_context: true,
				});
			}
		} catch (e: unknown) {
			console.warn("[unassigned] Failed to fetch parent context issues:", e);
			break;
		}
	}

	return issues;
}
