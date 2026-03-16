// ─── Core Domain Types ──────────────────────────────

export interface Activity {
	id: string;
	issueKey: string;
	issueSummary: string;
	issueType: string;
	field: string;
	fieldCategory: "status" | "assignee" | "date" | "comment" | "other";
	from: string;
	to: string;
	author: string;
	authorId: string;
	timestamp: Date;
	changeType?: string;
}

export interface TreeNode {
	key: string;
	summary: string;
	type: "epic" | "task" | "subtask" | "story" | "bug";
	status: string;
	changes: Activity[];
	children: TreeNode[];
}

// ─── Application State ─────────────────────────────

export interface MemberCount {
	name: string;
	count: number;
}

// ─── Jira API Response Types ────────────────────────

export interface JiraProject {
	id: string;
	key: string;
	name: string;
	lead?: {
		accountId: string;
		displayName: string;
	};
	roles?: Record<string, string>;
}

export interface JiraUser {
	accountId: string;
	displayName: string;
	emailAddress?: string;
	avatarUrls?: Record<string, string>;
	active?: boolean;
}

export interface JiraIssueType {
	name: string;
	subtask?: boolean;
}

export interface JiraStatus {
	name: string;
}

export interface JiraIssueFields {
	summary: string;
	status?: JiraStatus;
	assignee?: JiraUser | null;
	issuetype?: JiraIssueType;
	parent?: {
		key: string;
		fields?: {
			summary?: string;
		};
	};
	priority?: { name: string };
	created?: string;
	updated?: string;
	comment?: {
		comments: JiraComment[];
	};
}

export interface JiraIssue {
	id: string;
	key: string;
	fields: JiraIssueFields;
}

export interface JiraComment {
	id: string;
	author?: JiraUser;
	body?: AdfNode;
	created: string;
	updated?: string;
}

export interface JiraChangelogItem {
	field: string;
	fieldId?: string;
	fromString?: string | null;
	toString?: string | null;
	from?: string | null;
	to?: string | null;
}

export interface JiraChangelogHistory {
	id: string;
	author?: JiraUser;
	created: string;
	items: JiraChangelogItem[];
}

export interface JiraChangelog {
	values: JiraChangelogHistory[];
}

export interface JiraSearchResponse {
	issues: JiraIssue[];
	total?: number;
	nextPageToken?: string;
	isLast?: boolean;
}

// ─── Atlassian Document Format ──────────────────────

export interface AdfNode {
	type: string;
	text?: string;
	attrs?: Record<string, unknown>;
	content?: AdfNode[];
}

// ─── Stale Issues ───────────────────────────────────

export interface StaleIssue {
	key: string;
	summary: string;
	type: string;
	status: string;
	assignee: string;
	parent_key: string | null;
	is_context: boolean | number; // true/1 = parent shown for context, not actually stale
	updated: number;
}

export interface StaleTreeNode {
	key: string;
	summary: string;
	type: "epic" | "task" | "subtask" | "story" | "bug";
	status: string;
	updated: number;
	isContext: boolean;
	children: StaleTreeNode[];
}

// ─── Date Range ─────────────────────────────────────

export interface DateRange {
	start: Date;
	end: Date;
}

// ─── Issue Map (internal, used during tree building) ─

export interface IssueMapEntry {
	key: string;
	summary: string;
	type: string;
	parentKey: string | null;
	parentSummary: string | null;
	status: string;
	assignee: string;
	changes: Activity[];
}

// ─── Stale Counts (summary) ─────────────────────────

export interface StaleCount {
	member: string;
	count: number;
}

// ─── Unassigned Issues ──────────────────────────────

export interface UnassignedIssue {
	key: string;
	summary: string;
	type: string;
	status: string;
	parent_key: string | null;
	is_context: boolean | number;
	updated: number;
}

export interface UnassignedTreeNode {
	key: string;
	summary: string;
	type: "epic" | "task" | "subtask" | "story" | "bug";
	status: string;
	isContext: boolean;
	children: UnassignedTreeNode[];
}
