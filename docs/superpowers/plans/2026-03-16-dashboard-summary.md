# Dashboard Summary & Unassigned Issues Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-level summary dashboard (member ranking, daily activity chart, stale counts, unassigned issues tree) shown when no member is selected.

**Architecture:** New `DashboardSummary` component replaces the activity feed + changed issues panels when `selectedMember` is null. Two new backend endpoints (`stale-counts`, `unassigned-issues`) follow the same pattern as the existing `stale-issues` endpoint. Pure CSS charts — no charting library.

**Tech Stack:** React, Tailwind CSS, shadcn/ui Card, Hono backend, SQLite (bun:sqlite)

**Spec:** `docs/superpowers/specs/2026-03-16-dashboard-summary-design.md`

---

## File Structure

**New files:**
- `src/components/DashboardSummary.tsx` — Container with MemberActivityChart, ActivityByDayChart, StaleCounts sub-components
- `src/components/UnassignedIssues.tsx` — Tree panel for unassigned issues

**Modified files:**
- `server/db.ts` — Add `stale_counts` and `unassigned_issues` tables + CRUD functions
- `server/index.ts` — Add two new endpoints
- `src/lib/jira.ts` — Add `fetchStaleCounts()` and `fetchUnassignedIssues()` client functions
- `src/types.ts` — Add `StaleCount` and `UnassignedIssue` types
- `src/App.tsx` — Conditional render of DashboardSummary vs feed+tree

---

## Chunk 1: Backend — DB Tables & Jira Fetch Functions

### Task 1: Add new types to `src/types.ts`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add StaleCount and UnassignedIssue types**

Add at the end of `src/types.ts`:

```typescript
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
```

- [ ] **Step 2: Run lint**

Run: `bun run lint:fix`

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add StaleCount and UnassignedIssue types"
```

---

### Task 2: Add DB tables and CRUD for stale_counts and unassigned_issues

**Files:**
- Modify: `server/db.ts`

- [ ] **Step 1: Add stale_counts table schema**

Add after the `stale_meta` table creation (after line 94 in `server/db.ts`):

```typescript
db.run(`
  CREATE TABLE IF NOT EXISTS stale_counts (
    project TEXT NOT NULL,
    before_date TEXT NOT NULL,
    member TEXT NOT NULL,
    count INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (project, before_date, member)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS unassigned_issues (
    key TEXT NOT NULL,
    project TEXT NOT NULL,
    summary TEXT,
    type TEXT,
    status TEXT,
    parent_key TEXT,
    is_context INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (key, project)
  )
`);
```

- [ ] **Step 2: Add DbStaleCount and DbUnassignedIssue types**

Add in the Types section of `server/db.ts`:

```typescript
export interface DbStaleCount {
	project: string;
	before_date: string;
	member: string;
	count: number;
	fetched_at: number;
}

export interface DbUnassignedIssue {
	key: string;
	project: string;
	summary: string;
	type: string;
	status: string;
	parent_key: string | null;
	is_context: number;
	updated: number;
	fetched_at: number;
}
```

- [ ] **Step 3: Add stale_counts CRUD functions**

Add at the end of `server/db.ts`:

```typescript
// ── Stale Counts ────────────────────────────────────

const STALE_COUNTS_TTL_MS = 5 * 60 * 1000;

const stmtGetStaleCounts = db.prepare<DbStaleCount, [string, string]>(
	"SELECT * FROM stale_counts WHERE project = ? AND before_date = ? ORDER BY count DESC",
);

const stmtDeleteStaleCounts = db.prepare<null, [string, string]>(
	"DELETE FROM stale_counts WHERE project = ? AND before_date = ?",
);

const stmtInsertStaleCount = db.prepare<null, [string, string, string, number, number]>(
	"INSERT OR REPLACE INTO stale_counts (project, before_date, member, count, fetched_at) VALUES (?, ?, ?, ?, ?)",
);

export function getStaleCounts(
	project: string,
	beforeDate: string,
): { counts: DbStaleCount[]; isFresh: boolean } {
	const counts = stmtGetStaleCounts.all(project, beforeDate);
	const isFresh =
		counts.length > 0 &&
		Date.now() - (counts[0]?.fetched_at ?? 0) < STALE_COUNTS_TTL_MS;
	return { counts, isFresh };
}

export function setStaleCounts(
	project: string,
	beforeDate: string,
	counts: { member: string; count: number }[],
): void {
	const now = Date.now();
	const txn = db.transaction(() => {
		stmtDeleteStaleCounts.run(project, beforeDate);
		for (const c of counts) {
			stmtInsertStaleCount.run(project, beforeDate, c.member, c.count, now);
		}
	});
	txn();
}
```

- [ ] **Step 4: Add unassigned_issues CRUD functions**

Add at the end of `server/db.ts`:

```typescript
// ── Unassigned Issues ───────────────────────────────

const UNASSIGNED_TTL_MS = 5 * 60 * 1000;

const stmtGetUnassignedIssues = db.prepare<DbUnassignedIssue, [string]>(
	"SELECT * FROM unassigned_issues WHERE project = ? ORDER BY updated ASC",
);

const stmtDeleteUnassignedIssues = db.prepare<null, [string]>(
	"DELETE FROM unassigned_issues WHERE project = ?",
);

const stmtInsertUnassignedIssue = db.prepare<
	null,
	[string, string, string, string, string, string | null, number, number, number]
>(
	"INSERT OR REPLACE INTO unassigned_issues (key, project, summary, type, status, parent_key, is_context, updated, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
);

export function getUnassignedIssues(
	project: string,
): { issues: DbUnassignedIssue[]; isFresh: boolean } {
	const issues = stmtGetUnassignedIssues.all(project);
	const isFresh =
		issues.length > 0 &&
		Date.now() - (issues[0]?.fetched_at ?? 0) < UNASSIGNED_TTL_MS;
	return { issues, isFresh };
}

export function setUnassignedIssues(
	project: string,
	issues: Omit<DbUnassignedIssue, "fetched_at">[],
): void {
	const now = Date.now();
	const txn = db.transaction(() => {
		stmtDeleteUnassignedIssues.run(project);
		for (const i of issues) {
			stmtInsertUnassignedIssue.run(
				i.key,
				i.project,
				i.summary,
				i.type,
				i.status,
				i.parent_key,
				i.is_context,
				i.updated,
				now,
			);
		}
	});
	txn();
}
```

- [ ] **Step 5: Run lint**

Run: `bun run lint:fix`

- [ ] **Step 6: Commit**

```bash
git add server/db.ts
git commit -m "feat: add stale_counts and unassigned_issues DB tables and CRUD"
```

---

### Task 3: Add Jira fetch functions for stale counts and unassigned issues

**Files:**
- Modify: `server/jira.ts`

- [ ] **Step 1: Add `fetchStaleCountsFromJira` function**

Add at the end of `server/jira.ts`:

```typescript
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
```

- [ ] **Step 2: Add `fetchUnassignedIssuesFromJira` function**

Add at the end of `server/jira.ts`. This follows the same parent-chain-walking pattern as `fetchStaleIssuesFromJira`:

```typescript
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
```

- [ ] **Step 3: Run lint**

Run: `bun run lint:fix`

- [ ] **Step 4: Commit**

```bash
git add server/jira.ts
git commit -m "feat: add fetchStaleCountsFromJira and fetchUnassignedIssuesFromJira"
```

---

### Task 4: Add backend endpoints

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add imports**

Add to the imports from `./db.ts` in `server/index.ts`:

```typescript
import {
	// ... existing imports ...
	getStaleCounts,
	setStaleCounts,
	getUnassignedIssues,
	setUnassignedIssues,
} from "./db.ts";
```

Add to the imports from `./jira.ts`:

```typescript
import {
	// ... existing imports ...
	fetchStaleCountsFromJira,
	fetchUnassignedIssuesFromJira,
} from "./jira.ts";
```

- [ ] **Step 2: Add stale-counts endpoint**

Add after the existing `stale-issues` endpoint (after line 205 in `server/index.ts`):

```typescript
// ── Stale Counts (summary per member) ────────────────

app.get("/api/stale-counts/:project", async (c) => {
	const project = c.req.param("project");
	const before = c.req.query("before");

	if (!before) {
		return c.json({ error: "Missing before query param" }, 400);
	}
	if (!isValidProjectKey(project)) {
		return c.json({ error: "Invalid project key" }, 400);
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) {
		return c.json({ error: "Invalid date format (expected YYYY-MM-DD)" }, 400);
	}

	// Check cache
	const cached = getStaleCounts(project, before);
	if (cached.isFresh) {
		return c.json({
			counts: cached.counts.map((row) => ({ member: row.member, count: row.count })),
		});
	}

	// Fetch from Jira
	try {
		const counts = await fetchStaleCountsFromJira(project, before);
		setStaleCounts(project, before, counts);
		return c.json({ counts });
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : "Failed to fetch stale counts";
		console.warn("[stale-counts] Error:", msg);
		if (cached.counts.length > 0) {
			return c.json({
				counts: cached.counts.map((row) => ({ member: row.member, count: row.count })),
			});
		}
		return c.json({ error: msg }, 502);
	}
});
```

- [ ] **Step 3: Add unassigned-issues endpoint**

Add after the stale-counts endpoint:

```typescript
// ── Unassigned Issues ────────────────────────────────

app.get("/api/unassigned-issues/:project", async (c) => {
	const project = c.req.param("project");

	if (!isValidProjectKey(project)) {
		return c.json({ error: "Invalid project key" }, 400);
	}

	// Normalize DB rows to API response shape (strip fetched_at, project)
	const toResponse = (rows: { key: string; summary: string; type: string; status: string; parent_key: string | null; is_context: number | boolean; updated: number }[]) =>
		rows.map((i) => ({
			key: i.key,
			summary: i.summary,
			type: i.type,
			status: i.status,
			parent_key: i.parent_key,
			is_context: !!i.is_context,
			updated: i.updated,
		}));

	// Check cache
	const cached = getUnassignedIssues(project);
	if (cached.isFresh) {
		return c.json({ issues: toResponse(cached.issues) });
	}

	// Fetch from Jira
	try {
		const issues = await fetchUnassignedIssuesFromJira(project);
		const dbIssues = issues.map((i) => ({ ...i, project, is_context: i.is_context ? 1 : (0 as number) }));
		setUnassignedIssues(project, dbIssues);
		return c.json({ issues: toResponse(issues) });
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : "Failed to fetch unassigned issues";
		console.warn("[unassigned] Error:", msg);
		if (cached.issues.length > 0) {
			return c.json({ issues: toResponse(cached.issues) });
		}
		return c.json({ error: msg }, 502);
	}
});
```

- [ ] **Step 4: Run lint**

Run: `bun run lint:fix`

- [ ] **Step 5: Commit**

```bash
git add server/index.ts
git commit -m "feat: add stale-counts and unassigned-issues endpoints"
```

---

## Chunk 2: Frontend — Client Functions, Components, App Integration

### Task 5: Add client-side fetch functions

**Files:**
- Modify: `src/lib/jira.ts`

- [ ] **Step 1: Add fetchStaleCounts function**

Add at the end of `src/lib/jira.ts`:

```typescript
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
	const data: { counts: { member: string; count: number }[] } = await res.json();
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
	const data: { issues: import("@/types").UnassignedIssue[] } = await res.json();
	return data.issues;
}
```

- [ ] **Step 2: Run lint**

Run: `bun run lint:fix`

- [ ] **Step 3: Commit**

```bash
git add src/lib/jira.ts
git commit -m "feat: add fetchStaleCounts and fetchUnassignedIssues client functions"
```

---

### Task 6: Create UnassignedIssues component

**Files:**
- Create: `src/components/UnassignedIssues.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/UnassignedIssues.tsx`. This follows the same pattern as `StaleIssues.tsx` — collapsible tree, type badges, context parents dimmed. Key differences: no time-ago labels, no urgency indicators, no member/date dependencies (date-agnostic).

```tsx
import { ChevronRight, UserX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { fetchUnassignedIssues } from "@/lib/jira";
import { useAppState } from "@/state/store";
import type { UnassignedIssue, UnassignedTreeNode } from "@/types";

// ── Helpers ──────────────────────────────────────────────────

function normalizeType(
	type: string,
): "epic" | "task" | "subtask" | "story" | "bug" {
	const t = type.toLowerCase();
	if (t.includes("epic")) return "epic";
	if (t.includes("sub")) return "subtask";
	if (t.includes("story")) return "story";
	if (t.includes("bug")) return "bug";
	return "task";
}

function buildUnassignedTree(issues: UnassignedIssue[]): UnassignedTreeNode[] {
	const issueMap = new Map<string, UnassignedIssue>();
	for (const issue of issues) {
		issueMap.set(issue.key, issue);
	}

	const childrenMap = new Map<string, UnassignedIssue[]>();
	for (const issue of issues) {
		if (issue.parent_key && issueMap.has(issue.parent_key)) {
			const children = childrenMap.get(issue.parent_key) || [];
			children.push(issue);
			childrenMap.set(issue.parent_key, children);
		}
	}

	const childKeySet = new Set(
		[...childrenMap.values()].flat().map((i) => i.key),
	);
	const roots = issues.filter((i) => !childKeySet.has(i.key));

	function toNode(issue: UnassignedIssue): UnassignedTreeNode {
		const children = (childrenMap.get(issue.key) || []).map(toNode);
		return {
			key: issue.key,
			summary: issue.summary,
			type: normalizeType(issue.type),
			status: issue.status,
			isContext: !!issue.is_context,
			children,
		};
	}

	return roots.map(toNode);
}

function countNodes(nodes: UnassignedTreeNode[]): number {
	return nodes.reduce(
		(sum, n) => sum + (n.isContext ? 0 : 1) + countNodes(n.children),
		0,
	);
}

// ── Badge classes ────────────────────────────────────────────

const typeBadgeClasses: Record<string, string> = {
	epic: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
	task: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
	subtask: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
	story: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
	bug: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

// ── Component ────────────────────────────────────────────────

export function UnassignedIssues() {
	const { selectedProject } = useAppState();
	const [issues, setIssues] = useState<UnassignedIssue[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!selectedProject) {
			setIssues([]);
			return;
		}

		let cancelled = false;
		setLoading(true);

		fetchUnassignedIssues(selectedProject)
			.then((result) => {
				if (!cancelled) setIssues(result);
			})
			.catch((e: unknown) => {
				console.warn("[UnassignedIssues] fetch failed:", e);
				if (!cancelled) setIssues([]);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [selectedProject]);

	const tree = useMemo(() => buildUnassignedTree(issues), [issues]);
	const nodeCount = useMemo(() => countNodes(tree), [tree]);

	return (
		<div className="rounded-xl border bg-card p-4">
			<div className="mb-3 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<UserX className="size-4 text-muted-foreground" />
					<h2 className="text-sm font-semibold">Unassigned Issues</h2>
				</div>
				<Badge variant="secondary" className="tabular-nums">
					{nodeCount}
				</Badge>
			</div>

			{loading ? (
				<div className="flex items-center justify-center py-8 text-muted-foreground">
					<span className="text-xs">Loading unassigned issues...</span>
				</div>
			) : tree.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
					<span className="mb-2 text-2xl">&#10003;</span>
					<h3 className="text-sm font-medium">No unassigned issues</h3>
					<p className="text-xs">All open issues have an assignee</p>
				</div>
			) : (
				<div className="space-y-0.5">
					{tree.map((node) => (
						<UnassignedNodeRow key={node.key} node={node} depth={0} />
					))}
				</div>
			)}
		</div>
	);
}

// ── Recursive tree node ──────────────────────────────────────

function UnassignedNodeRow({
	node,
	depth,
}: { node: UnassignedTreeNode; depth: number }) {
	const [open, setOpen] = useState(node.isContext);
	const hasChildren = node.children.length > 0;
	const typeClass = typeBadgeClasses[node.type] || typeBadgeClasses.task;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<div style={{ paddingLeft: `${depth * 20}px` }}>
				<CollapsibleTrigger
					className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/60 ${
						node.isContext ? "opacity-60" : ""
					}`}
					disabled={!hasChildren}
				>
					<ChevronRight
						className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${
							hasChildren ? "" : "invisible"
						} ${open ? "rotate-90" : ""}`}
					/>

					<span
						className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${typeClass}`}
					>
						{node.type === "subtask" ? "sub" : node.type}
					</span>

					<span className="shrink-0 text-xs font-medium text-muted-foreground">
						{node.key}
					</span>

					<span className="min-w-0 flex-1 truncate text-xs">
						{node.summary}
					</span>

					{node.status && (
						<span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
							{node.status}
						</span>
					)}
				</CollapsibleTrigger>

				{hasChildren && (
					<CollapsibleContent>
						<div className="space-y-0.5">
							{node.children.map((child) => (
								<UnassignedNodeRow
									key={child.key}
									node={child}
									depth={depth + 1}
								/>
							))}
						</div>
					</CollapsibleContent>
				)}
			</div>
		</Collapsible>
	);
}
```

- [ ] **Step 2: Run lint**

Run: `bun run lint:fix`

- [ ] **Step 3: Commit**

```bash
git add src/components/UnassignedIssues.tsx
git commit -m "feat: add UnassignedIssues tree component"
```

---

### Task 7: Create DashboardSummary component

**Files:**
- Create: `src/components/DashboardSummary.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/DashboardSummary.tsx` with MemberActivityChart, ActivityByDayChart, and StaleCounts sub-components:

```tsx
import { Clock, Loader2, TrendingUp, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { UnassignedIssues } from "@/components/UnassignedIssues";
import { getDateRange } from "@/lib/dates";
import { fetchStaleCounts } from "@/lib/jira";
import { useAppDispatch, useAppState } from "@/state/store";
import type { Activity, MemberCount } from "@/types";

// ── Props ───────────────────────────────────────────────────

interface DashboardSummaryProps {
	activities: Activity[];
	members: MemberCount[];
}

export function DashboardSummary({
	activities,
	members,
}: DashboardSummaryProps) {
	return (
		<div className="space-y-6">
			{/* Charts row */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<MemberActivityChart members={members} />
				<ActivityByDayChart activities={activities} />
			</div>

			{/* Stale counts */}
			<StaleCountsPanel />

			{/* Unassigned issues */}
			<UnassignedIssues />
		</div>
	);
}

// ── Member Activity Chart ───────────────────────────────────

function MemberActivityChart({ members }: { members: MemberCount[] }) {
	const dispatch = useAppDispatch();
	const maxCount = Math.max(...members.map((m) => m.count), 1);

	// Only show members with activity, plus up to 5 without
	const activeMembers = members.filter((m) => m.count > 0);
	const inactiveMembers = members.filter((m) => m.count === 0).slice(0, 5);
	const displayMembers = [...activeMembers, ...inactiveMembers];

	return (
		<Card>
			<CardContent>
				<div className="mb-3 flex items-center gap-2">
					<Users className="size-4 text-muted-foreground" />
					<h3 className="text-sm font-semibold">Member Activity</h3>
				</div>

				{displayMembers.length === 0 ? (
					<p className="py-4 text-center text-xs text-muted-foreground">
						No activity data
					</p>
				) : (
					<div className="space-y-1.5">
						{displayMembers.map((m) => (
							<button
								key={m.name}
								type="button"
								className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-1 text-left hover:bg-muted/60"
								onClick={() =>
									dispatch({
										type: "SET_SELECTED_MEMBER",
										payload: m.name,
									})
								}
							>
								<span className="w-28 shrink-0 truncate text-xs">
									{m.name}
								</span>
								<div className="flex-1">
									<div
										className="h-4 rounded-sm bg-primary/70 transition-all"
										style={{
											width: `${(m.count / maxCount) * 100}%`,
											minWidth: m.count > 0 ? "4px" : "0px",
										}}
									/>
								</div>
								<span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
									{m.count}
								</span>
							</button>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

// ── Activity By Day Chart ───────────────────────────────────

function ActivityByDayChart({ activities }: { activities: Activity[] }) {
	const state = useAppState();

	const dailyCounts = useMemo(() => {
		// Group activities by date
		const counts = new Map<string, number>();
		for (const a of activities) {
			const dateStr = a.timestamp.toISOString().split("T")[0] as string;
			counts.set(dateStr, (counts.get(dateStr) || 0) + 1);
		}

		// Fill in all dates in the range
		const range = getDateRange(state.period, state.currentDate);
		const result: { date: string; count: number }[] = [];
		const d = new Date(range.start);
		while (d <= range.end) {
			const dateStr = d.toISOString().split("T")[0] as string;
			result.push({ date: dateStr, count: counts.get(dateStr) || 0 });
			d.setDate(d.getDate() + 1);
		}
		return result;
	}, [activities, state.period, state.currentDate]);

	const maxCount = Math.max(...dailyCounts.map((d) => d.count), 1);
	const isSingleDay = dailyCounts.length <= 1;

	return (
		<Card>
			<CardContent>
				<div className="mb-3 flex items-center gap-2">
					<TrendingUp className="size-4 text-muted-foreground" />
					<h3 className="text-sm font-semibold">Activity by Day</h3>
				</div>

				{isSingleDay ? (
					<div className="flex flex-col items-center justify-center py-6">
						<span className="text-4xl font-bold tracking-tight">
							{dailyCounts[0]?.count ?? 0}
						</span>
						<span className="text-xs text-muted-foreground">
							changes today
						</span>
					</div>
				) : (
					<div className="flex h-[150px] items-end gap-0.5">
						{dailyCounts.map((d) => (
							<div
								key={d.date}
								className="group relative flex flex-1 flex-col items-center justify-end"
							>
								{/* Count tooltip on hover */}
								<span className="mb-1 text-[9px] tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
									{d.count}
								</span>
								<div
									className="w-full rounded-t-sm bg-primary/50 transition-all group-hover:bg-primary/70"
									style={{
										height: `${(d.count / maxCount) * 100}%`,
										minHeight: d.count > 0 ? "2px" : "0px",
									}}
								/>
								{/* Date label — show for first, last, and every 7th */}
								{dailyCounts.length <= 7 ||
								d === dailyCounts[0] ||
								d === dailyCounts[dailyCounts.length - 1] ? (
									<span className="mt-1 text-[8px] text-muted-foreground">
										{d.date.slice(5)}
									</span>
								) : null}
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

// ── Stale Counts Panel ──────────────────────────────────────

function StaleCountsPanel() {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const [counts, setCounts] = useState<{ member: string; count: number }[]>([]);
	const [loading, setLoading] = useState(false);

	const beforeDate = useMemo(() => {
		const range = getDateRange(state.period, state.currentDate);
		return range.start.toISOString().split("T")[0] as string;
	}, [state.period, state.currentDate]);

	useEffect(() => {
		if (!state.selectedProject) {
			setCounts([]);
			return;
		}

		let cancelled = false;
		setLoading(true);

		fetchStaleCounts(state.selectedProject, beforeDate)
			.then((result) => {
				if (!cancelled) setCounts(result);
			})
			.catch((e: unknown) => {
				console.warn("[StaleCounts] fetch failed:", e);
				if (!cancelled) setCounts([]);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [state.selectedProject, beforeDate]);

	const totalStale = counts.reduce((sum, c) => sum + c.count, 0);

	return (
		<div className="rounded-xl border bg-card p-4">
			<div className="mb-3 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Clock className="size-4 text-muted-foreground" />
					<h2 className="text-sm font-semibold">Stale Issues by Member</h2>
				</div>
				<Badge variant="secondary" className="tabular-nums">
					{totalStale}
				</Badge>
			</div>

			{loading ? (
				<div className="flex items-center justify-center py-6 text-muted-foreground">
					<Loader2 className="mr-2 size-4 animate-spin" />
					<span className="text-xs">Loading stale counts...</span>
				</div>
			) : counts.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
					<span className="mb-2 text-2xl">&#10003;</span>
					<h3 className="text-sm font-medium">No stale issues</h3>
					<p className="text-xs">
						All assigned issues have been updated recently
					</p>
				</div>
			) : (
				<div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
					{counts.map((c) => (
						<button
							key={c.member}
							type="button"
							className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left hover:bg-muted/60"
							onClick={() =>
								dispatch({
									type: "SET_SELECTED_MEMBER",
									payload: c.member,
								})
							}
						>
							<span className="truncate text-xs">{c.member}</span>
							<Badge
								variant="secondary"
								className={`ml-2 tabular-nums ${
									c.count > 5
										? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
										: ""
								}`}
							>
								{c.count}
							</Badge>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Run lint**

Run: `bun run lint:fix`

- [ ] **Step 3: Commit**

```bash
git add src/components/DashboardSummary.tsx
git commit -m "feat: add DashboardSummary component with charts and stale counts"
```

---

### Task 8: Integrate DashboardSummary into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add import**

Add at the top of `src/App.tsx` with the other component imports:

```typescript
import { DashboardSummary } from "@/components/DashboardSummary";
```

- [ ] **Step 2: Replace the content grid and stale issues section**

In `src/App.tsx`, replace the content grid section (the `{/* Content grid */}` comment and the `<div className="mt-6 grid ...">` through the closing `StaleIssues` section) with a conditional:

Replace this block (approximately lines 90-100):
```tsx
{/* Content grid */}
<div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
	<ActivityFeed activities={filteredActivities} />
	<EpicTree issueTree={filteredIssueTree} />
</div>

{state.selectedMember && (
	<div className="mt-6">
		<StaleIssues activeIssueKeys={filteredIssueTree} />
	</div>
)}
```

With:
```tsx
{/* Content — summary dashboard or member detail */}
{state.selectedMember ? (
	<>
		<div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
			<ActivityFeed activities={filteredActivities} />
			<EpicTree issueTree={filteredIssueTree} />
		</div>
		<div className="mt-6">
			<StaleIssues activeIssueKeys={filteredIssueTree} />
		</div>
	</>
) : (
	<div className="mt-6">
		<DashboardSummary
			activities={filteredActivities}
			members={filteredMembers}
		/>
	</div>
)}
```

- [ ] **Step 3: Run lint**

Run: `bun run lint:fix`

- [ ] **Step 4: Verify the app runs**

Run: `bun run dev`

Open the app in the browser. With no member selected, the DashboardSummary should render with the member activity chart, daily activity chart, stale counts panel, and unassigned issues tree. Clicking a member name should switch to the member detail view.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: show DashboardSummary when no member selected"
```

---

## Chunk 3: Final Verification & Lint

### Task 9: Full lint pass and manual verification

- [ ] **Step 1: Run full lint**

Run: `bun run lint:fix`

Fix any issues found.

- [ ] **Step 2: Manual testing checklist**

1. No member selected → DashboardSummary renders with all 4 panels
2. Member activity bars are proportional, clickable
3. Activity by day shows bars for each day in the period
4. Switching period (daily/weekly/monthly) updates the daily chart
5. Stale counts show per-member counts, orange badge on >5
6. Clicking member name in stale counts switches to member view
7. Unassigned issues tree renders with proper hierarchy
8. Context parents shown dimmed in unassigned tree
9. Selecting a member → switches to feed + tree + stale issues view
10. Deselecting member → back to summary dashboard

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address lint and verification issues"
```
