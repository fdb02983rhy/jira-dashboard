import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import {
	clearActivitiesForIssues,
	clearActivitiesForRange,
	getActivities,
	getIssues,
	getMembers,
	getSyncedAt,
	insertActivities,
	insertIssues,
	setMembers,
	setSyncedAt,
} from "./db.ts";
import {
	fetchActivitiesFromJira,
	fetchMembersFromJira,
	isValidProjectKey,
} from "./jira.ts";

const PORT = 3456;
const SYNC_TTL_MS = 2 * 60 * 1000; // 2 minutes

const env = {
	url: process.env.ATLASSIAN_URL || "",
	email: process.env.ATLASSIAN_USERNAME || "",
	token: process.env.ATLASSIAN_API_TOKEN || "",
};

const app = new Hono();

// ── CORS ────────────────────────────────────────────────────

app.use(
	"*",
	cors({
		origin:
			process.env.NODE_ENV === "production"
				? "http://localhost:3456"
				: "http://localhost:5173",
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type"],
	}),
);

// ── Config ──────────────────────────────────────────────────

app.get("/api/config", (c) => {
	return c.json({
		url: env.url,
		email: env.email,
		hasToken: !!env.token,
	});
});

// ── Activities (cached + delta sync) ────────────────────────

app.post("/api/activities", async (c) => {
	let body: { project: string; start: string; end: string; force?: boolean };
	try {
		body = await c.req.json();
	} catch (_e: unknown) {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const { project, start, end, force } = body;
	if (!project || !start || !end) {
		return c.json({ error: "Missing project, start, or end" }, 400);
	}

	if (!isValidProjectKey(project)) {
		return c.json({ error: "Invalid project key" }, 400);
	}

	const startMs = new Date(start).getTime();
	const endNext = new Date(end);
	endNext.setDate(endNext.getDate() + 1);
	const endMs = endNext.getTime();

	if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
		return c.json({ error: "Invalid date format" }, 400);
	}

	const lastSynced = getSyncedAt(project, start, end);
	const isFresh = lastSynced && Date.now() - lastSynced < SYNC_TTL_MS;

	// If not fresh or forced, sync from Jira
	if (!isFresh || force) {
		try {
			if (force || !lastSynced) {
				// Full fetch — clear existing data for this range
				console.log(`[sync] Full fetch: ${project} ${start}..${end}`);
				clearActivitiesForRange(project, startMs, endMs);
				const result = await fetchActivitiesFromJira(project, start, end);
				insertActivities(result.activities);
				insertIssues(result.issues);
			} else {
				// Delta fetch — only issues updated since last sync
				const sinceDate = new Date(lastSynced)
					.toISOString()
					.split("T")[0] as string;
				console.log(
					`[sync] Delta fetch since ${sinceDate}: ${project} ${start}..${end}`,
				);
				const result = await fetchActivitiesFromJira(
					project,
					start,
					end,
					sinceDate,
				);
				// Remove old activities for changed issues, insert fresh ones
				if (result.changedIssueKeys.length > 0) {
					clearActivitiesForIssues(result.changedIssueKeys, startMs, endMs);
					insertActivities(result.activities);
					insertIssues(result.issues);
				}
			}
			setSyncedAt(project, start, end);
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : "Sync failed";
			console.error(`[sync] Error: ${msg}`);
			// If we have cached data, return it despite the error
			const cached = getActivities(project, startMs, endMs);
			if (cached.length > 0) {
				console.log("[sync] Returning stale cached data after error");
			} else {
				return c.json({ error: msg }, 502);
			}
		}
	} else {
		console.log(`[sync] Cache hit: ${project} ${start}..${end}`);
	}

	// Return activities + issues from DB
	const activities = getActivities(project, startMs, endMs);
	const issues = getIssues(project);

	return c.json({ activities, issues });
});

// ── Members (cached) ────────────────────────────────────────

app.get("/api/members/:project", async (c) => {
	const project = c.req.param("project");
	const force = c.req.query("force") === "1";

	let names = getMembers(project);

	if (names.length === 0 || force) {
		try {
			const fetched = await fetchMembersFromJira(project);
			setMembers(project, fetched);
			names = fetched;
		} catch (e: unknown) {
			console.warn("Failed to fetch members from Jira:", e);
			// Return cached if available
		}
	}

	return c.json({ members: names });
});

// ── Jira Proxy (for connection test + projects) ─────────────

app.all("/jira/*", async (c) => {
	const jiraBase = env.url.replace(/\/+$/, "");
	if (!jiraBase) {
		return c.json({ error: "ATLASSIAN_URL not configured" }, 500);
	}

	const auth = `Basic ${btoa(`${env.email}:${env.token}`)}`;
	const url = new URL(c.req.url);
	const jiraPath = url.pathname.slice("/jira".length) + url.search;
	const jiraUrl = `${jiraBase}${jiraPath}`;

	try {
		const method = c.req.method;
		const body =
			method !== "GET" && method !== "HEAD" ? await c.req.text() : undefined;

		const jiraRes = await fetch(jiraUrl, {
			method,
			headers: {
				Authorization: auth,
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body,
		});

		const responseText = await jiraRes.text();
		return new Response(responseText, {
			status: jiraRes.status,
			headers: {
				"Content-Type":
					jiraRes.headers.get("content-type") || "application/json",
			},
		});
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : "Proxy error";
		return c.json({ error: msg }, 502);
	}
});

// ── Static files (production) ───────────────────────────────

if (process.env.NODE_ENV === "production") {
	app.use("/*", serveStatic({ root: "./dist" }));
	app.get("*", serveStatic({ path: "./dist/index.html" }));
}

console.log(`\n  ⚡ Jira Dashboard running at http://localhost:${PORT}`);
console.log(`  📡 Jira: ${env.url || "(not set)"}`);
console.log(`  👤 User: ${env.email || "(not set)"}`);
console.log(`  💾 Cache: SQLite (sync TTL ${SYNC_TTL_MS / 1000}s)\n`);

export default {
	port: PORT,
	fetch: app.fetch,
};
