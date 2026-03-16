# Dashboard Summary View & Unassigned Issues

## Overview

When no team member is selected, replace the activity feed + changed issues panels with a project-level summary dashboard. This gives PMs a quick health overview before drilling into individual members.

## Layout

```
No member selected:
+-------------------------------------------+
| SummaryCards (existing, unchanged)         |
+---------------------+---------------------+
| Member Activity     | Activity by Day     |
| (horizontal bars)   | (vertical bars)     |
+---------------------+---------------------+
| Stale Issues per Member (compact list)    |
+-------------------------------------------+
| Unassigned Issues (tree)                  |
+-------------------------------------------+

Member selected (unchanged):
+-------------------------------------------+
| SummaryCards                              |
+---------------------+---------------------+
| Activity Feed       | Changed Issues      |
+---------------------+---------------------+
| Stale Issues                              |
+-------------------------------------------+
```

App.tsx conditionally renders `<DashboardSummary>` (new) vs the existing feed+tree when `selectedMember` is null.

## Components

### 1. DashboardSummary (new: `src/components/DashboardSummary.tsx`)

Container component rendered when no member is selected. Props:

- `activities: Activity[]` — all activities for the period (unfiltered by member since no member is selected; filtered by `categoryFilters` via existing `filteredActivities`)
- `members: MemberCount[]` — sorted array from `filteredMembers` in `useActivities()`

Fetches stale counts and unassigned issues internally via useEffect, depending on `selectedProject` and date range from state. Derives `beforeDate` using `getDateRange(period, currentDate).start` (same logic as existing StaleIssues component).

**Loading states:** Shows skeleton/spinner within each card while stale counts and unassigned issues are loading. The member activity and daily charts render immediately from props.

Sub-panels are named function components defined within `DashboardSummary.tsx` (co-located, not separate files — they're small and only used here).

### 2. MemberActivityChart (co-located in DashboardSummary.tsx)

Horizontal bar chart showing activity count per member.

- **Data source:** `members: MemberCount[]` prop (already sorted by count descending)
- **Rendering:** Pure CSS bars with Tailwind. Each row: member name (left-aligned), colored bar (width proportional to max count), count (right-aligned)
- **Interaction:** Clicking a member name dispatches `SET_SELECTED_MEMBER` to drill into that member
- **Styling:** Primary/blue bars, inside a shadcn Card

### 3. ActivityByDayChart (co-located in DashboardSummary.tsx)

Vertical bar chart showing daily activity volume.

- **Data source:** `activities` prop, grouped by date (`new Date(a.timestamp).toISOString().split('T')[0]`)
- **Rendering:** Pure CSS vertical bars. Container height ~150px. Each bar width = `100% / numDays`. Bar height proportional to max daily count. Count label above each bar.
- **Edge case:** For daily period (1 bar), show a prominent count number instead of a single-bar chart
- **Styling:** Muted primary bars, inside a shadcn Card

### 4. StaleCounts (co-located in DashboardSummary.tsx)

Compact list showing stale issue counts per member.

- **Data source:** New endpoint `GET /api/stale-counts/:project?before=YYYY-MM-DD`
- **Server logic:** Single JQL query: `project = "X" AND assignee IS NOT EMPTY AND updated < "beforeDate" AND statusCategory != Done`, maxResults=200. Server groups results by `assignee.displayName` and returns aggregated counts. Known limitation: projects with >200 stale issues across all members will have undercounted totals — acceptable for a summary view.
- **Rendering:** Each row: member name, count badge. Orange badge if count > 5.
- **Sorted:** By count descending
- **Interaction:** Clicking a member name dispatches `SET_SELECTED_MEMBER`
- **Caching:** SQLite table `stale_counts` with TTL (5 minutes), keyed by (project, before_date). Stores pre-aggregated (project, before_date, member, count, fetched_at) rows.
- **Styling:** Inside a shadcn Card
- **`beforeDate` derivation:** Uses `getDateRange(state.period, state.currentDate).start` formatted as YYYY-MM-DD

### 5. UnassignedIssues (new: `src/components/UnassignedIssues.tsx`)

Tree panel showing issues with no assignee that aren't Done. This endpoint is date-agnostic — it shows all currently unassigned open issues regardless of the selected time period.

- **Data source:** New endpoint `GET /api/unassigned-issues/:project`
- **Server logic:** JQL: `project = "X" AND assignee IS EMPTY AND statusCategory != Done ORDER BY updated ASC`, maxResults=50. Walk parent chain (same pattern as stale issues, MAX_DEPTH=5) for tree context.
- **Tree building:** Same pattern as StaleIssues — `buildUnassignedTree()` groups by parent, context parents shown dimmed
- **Each row displays:** Type badge, issue key, issue summary/name, status
- **Caching:** SQLite table `unassigned_issues` with TTL (5 minutes). Primary key: `(key TEXT, project TEXT)`. Schema: key, project, summary, type, status, parent_key, is_context, updated, fetched_at. TTL tracked via `fetched_at` on the rows themselves (same pattern as stale_issues).
- **Styling:** Collapsible tree inside a shadcn Card, matching EpicTree/StaleIssues visual style

## Backend Changes

### New Endpoints

#### `GET /api/stale-counts/:project?before=YYYY-MM-DD`

Returns stale issue counts grouped by assignee. Server performs the grouping.

```json
{
  "counts": [
    { "member": "Alice", "count": 5 },
    { "member": "Bob", "count": 2 }
  ]
}
```

**Validation:** `isValidProjectKey(project)`, date format regex `^\d{4}-\d{2}-\d{2}$`.

**Implementation:** Single JQL query fetching assigned + not-done + not-updated issues. Server groups by `assignee.displayName`, returns aggregated counts. Cache in SQLite with 5-minute TTL.

#### `GET /api/unassigned-issues/:project`

Returns unassigned issues with parent chain for tree building. Date-agnostic — returns all currently open unassigned issues.

```json
{
  "issues": [
    {
      "key": "DO-123",
      "summary": "Fix login bug",
      "type": "task",
      "status": "To Do",
      "assignee": "",
      "parent_key": "DO-50",
      "is_context": false
    }
  ]
}
```

**Validation:** `isValidProjectKey(project)`.

**Implementation:** JQL query for unassigned + not-done. Walk parent chain for context nodes. Cache in SQLite with 5-minute TTL.

### New Server Functions (server/jira.ts)

- `fetchStaleCountsFromJira(project, beforeDate)` — single JQL with `assignee IS NOT EMPTY`, returns `{ member: string; count: number }[]` after server-side grouping
- `fetchUnassignedIssuesFromJira(project)` — JQL + parent walk, returns same shape as `StaleIssue[]` from existing `fetchStaleIssuesFromJira`

### New DB Tables (server/db.ts)

- `stale_counts`: `(project TEXT, before_date TEXT, member TEXT, count INTEGER, fetched_at INTEGER, PRIMARY KEY (project, before_date, member))`. TTL checked via `fetched_at`.
- `unassigned_issues`: `(key TEXT, project TEXT, summary TEXT, type TEXT, status TEXT, parent_key TEXT, is_context INTEGER DEFAULT 0, updated INTEGER, fetched_at INTEGER, PRIMARY KEY (key, project))`. TTL checked via `fetched_at`.

No separate meta table needed — TTL is tracked via `fetched_at` on the rows themselves.

## Frontend Changes

### App.tsx

```tsx
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
  <DashboardSummary activities={filteredActivities} members={filteredMembers} />
)}
```

Note: When `selectedMember` is null, `filteredActivities` returns all activities (the member filter in `useActivities` passes everything through when no member is selected). Category filters still apply.

### State Changes

None. All data for the summary is derived from existing state (`activities`, `allMembers`) or fetched within the `DashboardSummary` component.

## Data Flow

1. User deselects member (or loads page with no member selected)
2. App.tsx renders `<DashboardSummary>` instead of feed+tree
3. DashboardSummary derives member ranking and daily activity from props (immediate render)
4. DashboardSummary fetches stale counts and unassigned issues via useEffect (depends on `selectedProject`, `period`, `currentDate` from state)
5. Cards show loading spinners for async data, render immediately for prop-derived data
6. All four panels render with the data

## Error Handling

- Stale counts / unassigned issues fetch failures: show inline error message within the card, don't break the rest of the summary
- Empty states: "No stale issues found" / "No unassigned issues" messages
- Loading states: Spinner within each async card while fetching

## Testing Plan

- Verify summary view renders when no member selected
- Verify clicking member in ranking/stale list selects that member
- Verify unassigned issues tree displays correctly with parent context
- Verify layout switches back to feed+tree when member is selected
- Verify new endpoints return correct data with proper validation
- Verify caching works (second request within TTL returns cached data)
- Verify `beforeDate` changes (period/date switch) trigger re-fetch of stale counts
