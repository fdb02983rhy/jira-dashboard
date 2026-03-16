import { Database } from "bun:sqlite";

// ── Schema ──────────────────────────────────────────────────

const db = new Database("server/cache.db");
db.run("PRAGMA journal_mode = WAL");

db.run(`
  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    issue_key TEXT NOT NULL,
    issue_summary TEXT,
    issue_type TEXT,
    field TEXT,
    field_category TEXT,
    from_val TEXT,
    to_val TEXT,
    author TEXT,
    author_id TEXT,
    timestamp INTEGER NOT NULL
  )
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_act_project_ts
  ON activities(project, timestamp)
`);

db.run(`
  CREATE TABLE IF NOT EXISTS issues (
    key TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    summary TEXT,
    type TEXT,
    parent_key TEXT,
    status TEXT,
    assignee TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS members (
    project TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (project, name)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    range_start TEXT NOT NULL,
    range_end TEXT NOT NULL,
    last_synced_at INTEGER NOT NULL
  )
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_sync_project
  ON sync_meta(project)
`);

db.run(`
  CREATE TABLE IF NOT EXISTS stale_issues (
    key TEXT NOT NULL,
    project TEXT NOT NULL,
    member TEXT NOT NULL,
    summary TEXT,
    type TEXT,
    status TEXT,
    assignee TEXT,
    parent_key TEXT,
    is_context INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (key, member)
  )
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_stale_project_member
  ON stale_issues(project, member)
`);

db.run(`
  CREATE TABLE IF NOT EXISTS stale_meta (
    project TEXT NOT NULL,
    member TEXT NOT NULL,
    before_date TEXT NOT NULL,
    PRIMARY KEY (project, member)
  )
`);

// ── Types ───────────────────────────────────────────────────

export interface DbActivity {
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

export interface DbIssue {
	key: string;
	project: string;
	summary: string;
	type: string;
	parent_key: string | null;
	status: string;
	assignee: string;
}

// ── Sync Meta ───────────────────────────────────────────────

function syncKey(project: string, start: string, end: string): string {
	return `${project}:${start}:${end}`;
}

const stmtGetSync = db.prepare<{ last_synced_at: number }, [string]>(
	"SELECT last_synced_at FROM sync_meta WHERE key = ?",
);

const stmtSetSync = db.prepare<null, [string, string, string, string, number]>(
	"INSERT OR REPLACE INTO sync_meta (key, project, range_start, range_end, last_synced_at) VALUES (?, ?, ?, ?, ?)",
);

// Check if any synced range for this project covers the requested range
const stmtGetCoveringSync = db.prepare<
	{ last_synced_at: number },
	[string, string, string]
>(
	"SELECT MAX(last_synced_at) as last_synced_at FROM sync_meta WHERE project = ? AND range_start <= ? AND range_end >= ?",
);

export function getSyncedAt(
	project: string,
	start: string,
	end: string,
): number | null {
	// First check exact match
	const exact = stmtGetSync.get(syncKey(project, start, end));
	if (exact) return exact.last_synced_at;

	// Then check if a larger range covers this one
	const covering = stmtGetCoveringSync.get(project, start, end);
	return covering?.last_synced_at ?? null;
}

export function setSyncedAt(project: string, start: string, end: string): void {
	stmtSetSync.run(
		syncKey(project, start, end),
		project,
		start,
		end,
		Date.now(),
	);
}

// ── Activities ──────────────────────────────────────────────

const stmtGetActivities = db.prepare<DbActivity, [string, number, number]>(
	"SELECT * FROM activities WHERE project = ? AND timestamp >= ? AND timestamp < ? ORDER BY timestamp DESC",
);

const stmtDeleteActivitiesByIssuesInRange = db.prepare<
	null,
	[string, number, number]
>(
	"DELETE FROM activities WHERE issue_key = ? AND timestamp >= ? AND timestamp < ?",
);

const stmtInsertActivity = db.prepare<
	null,
	[
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		number,
	]
>(
	"INSERT OR REPLACE INTO activities (id, project, issue_key, issue_summary, issue_type, field, field_category, from_val, to_val, author, author_id, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
);

const stmtDeleteActivitiesRange = db.prepare<null, [string, number, number]>(
	"DELETE FROM activities WHERE project = ? AND timestamp >= ? AND timestamp < ?",
);

export function getActivities(
	project: string,
	startMs: number,
	endMs: number,
): DbActivity[] {
	return stmtGetActivities.all(project, startMs, endMs);
}

export function clearActivitiesForRange(
	project: string,
	startMs: number,
	endMs: number,
): void {
	stmtDeleteActivitiesRange.run(project, startMs, endMs);
}

export function clearActivitiesForIssues(
	issueKeys: string[],
	startMs: number,
	endMs: number,
): void {
	const txn = db.transaction(() => {
		for (const key of issueKeys) {
			stmtDeleteActivitiesByIssuesInRange.run(key, startMs, endMs);
		}
	});
	txn();
}

export function insertActivities(activities: DbActivity[]): void {
	const txn = db.transaction(() => {
		for (const a of activities) {
			stmtInsertActivity.run(
				a.id,
				a.project,
				a.issue_key,
				a.issue_summary,
				a.issue_type,
				a.field,
				a.field_category,
				a.from_val,
				a.to_val,
				a.author,
				a.author_id,
				a.timestamp,
			);
		}
	});
	txn();
}

// ── Issues ──────────────────────────────────────────────────

const stmtGetIssues = db.prepare<DbIssue, [string]>(
	"SELECT * FROM issues WHERE project = ?",
);

const stmtInsertIssue = db.prepare<
	null,
	[string, string, string, string, string | null, string, string]
>(
	"INSERT OR REPLACE INTO issues (key, project, summary, type, parent_key, status, assignee) VALUES (?, ?, ?, ?, ?, ?, ?)",
);

export function getIssues(project: string): DbIssue[] {
	return stmtGetIssues.all(project);
}

export function insertIssues(issues: DbIssue[]): void {
	const txn = db.transaction(() => {
		for (const i of issues) {
			stmtInsertIssue.run(
				i.key,
				i.project,
				i.summary,
				i.type,
				i.parent_key,
				i.status,
				i.assignee,
			);
		}
	});
	txn();
}

// ── Members ─────────────────────────────────────────────────

const stmtGetMembers = db.prepare<{ name: string }, [string]>(
	"SELECT name FROM members WHERE project = ? ORDER BY name",
);

const stmtInsertMember = db.prepare<null, [string, string]>(
	"INSERT OR IGNORE INTO members (project, name) VALUES (?, ?)",
);

const stmtDeleteMembers = db.prepare<null, [string]>(
	"DELETE FROM members WHERE project = ?",
);

export function getMembers(project: string): string[] {
	return stmtGetMembers.all(project).map((r) => r.name);
}

// ── Stale Issues ────────────────────────────────────────────

export interface DbStaleIssue {
	key: string;
	project: string;
	member: string;
	summary: string;
	type: string;
	status: string;
	assignee: string;
	parent_key: string | null;
	is_context: number; // 0 = stale, 1 = context parent
	updated: number;
	fetched_at: number;
}

const STALE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const stmtGetStaleIssues = db.prepare<DbStaleIssue, [string, string]>(
	"SELECT * FROM stale_issues WHERE project = ? AND member = ? ORDER BY updated ASC",
);

const stmtGetStaleBeforeDate = db.prepare<
	{ before_date: string | null },
	[string, string]
>(
	"SELECT before_date FROM stale_meta WHERE project = ? AND member = ? LIMIT 1",
);

const stmtSetStaleBeforeDate = db.prepare<null, [string, string, string]>(
	"INSERT OR REPLACE INTO stale_meta (project, member, before_date) VALUES (?, ?, ?)",
);

const stmtInsertStaleIssue = db.prepare<
	null,
	[
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string | null,
		number,
		number,
		number,
	]
>(
	"INSERT OR REPLACE INTO stale_issues (key, project, member, summary, type, status, assignee, parent_key, is_context, updated, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
);

const stmtDeleteStaleIssues = db.prepare<null, [string, string]>(
	"DELETE FROM stale_issues WHERE project = ? AND member = ?",
);

export function getStaleIssues(
	project: string,
	member: string,
	beforeDate: string,
): { issues: DbStaleIssue[]; isFresh: boolean } {
	const issues = stmtGetStaleIssues.all(project, member);
	const cachedDate = stmtGetStaleBeforeDate.get(project, member);
	const dateMatches = cachedDate?.before_date === beforeDate;
	const isFresh =
		dateMatches &&
		issues.length > 0 &&
		Date.now() - (issues[0]?.fetched_at ?? 0) < STALE_TTL_MS;
	return { issues: dateMatches ? issues : [], isFresh };
}

export function setStaleIssues(
	project: string,
	member: string,
	beforeDate: string,
	issues: Omit<DbStaleIssue, "fetched_at">[],
): void {
	const now = Date.now();
	const txn = db.transaction(() => {
		stmtDeleteStaleIssues.run(project, member);
		stmtSetStaleBeforeDate.run(project, member, beforeDate);
		for (const i of issues) {
			stmtInsertStaleIssue.run(
				i.key,
				i.project,
				i.member,
				i.summary,
				i.type,
				i.status,
				i.assignee,
				i.parent_key,
				i.is_context ? 1 : 0,
				i.updated,
				now,
			);
		}
	});
	txn();
}

export function setMembers(project: string, names: string[]): void {
	const txn = db.transaction(() => {
		stmtDeleteMembers.run(project);
		for (const name of names) {
			stmtInsertMember.run(project, name);
		}
	});
	txn();
}
