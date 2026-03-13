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
	let idCounter = Date.now();

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
							id: `act-${++idCounter}`,
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
		} catch (e) {
			console.warn(`Changelog fetch failed for ${issue.key}:`, e);
		}

		// Comments
		const comments = issue.fields.comment?.comments || [];
		for (const c of comments) {
			const cMs = new Date(c.created).getTime();
			if (cMs < startMs || cMs >= endMs) continue;

			activities.push({
				id: `act-${++idCounter}`,
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
	actors?: Array<{ type: string; displayName?: string }>;
}

export async function fetchMembersFromJira(project: string): Promise<string[]> {
	const names = new Set<string>();

	try {
		const projectData = await jiraFetch<JiraProject>(
			`/rest/api/3/project/${project}`,
		);

		for (const [roleName, roleUrl] of Object.entries(projectData.roles || {})) {
			if (roleName === "atlassian-addons-project-access") continue;
			try {
				const parsed = new URL(roleUrl);
				const roleData = await jiraFetch<JiraRole>(parsed.pathname);
				for (const actor of roleData.actors || []) {
					if (actor.type === "atlassian-user-role-actor" && actor.displayName) {
						names.add(actor.displayName);
					}
				}
			} catch {
				// skip inaccessible roles
			}
		}

		// Also fetch assignees
		try {
			const data = await jiraFetch<JiraSearchResponse>(
				"/rest/api/3/search/jql",
				{
					method: "POST",
					body: {
						jql: `project = "${project}" AND assignee IS NOT EMPTY`,
						maxResults: 50,
						fields: ["assignee"],
					},
				},
			);
			for (const issue of data.issues || []) {
				const name = issue.fields.assignee?.displayName;
				if (name) names.add(name);
			}
		} catch {
			// skip
		}
	} catch (e) {
		console.warn("Failed to fetch members:", e);
	}

	return [...names].sort();
}
