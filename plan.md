# Jira Dashboard — Refactoring Plan

## Goal
Migrate from a monolithic `index.html` (1830 lines) + `server.ts` to a modern **Hono + React + Vite + shadcn/ui + Tailwind CSS** stack on Bun. Single page app with toast notifications and shadcn default theme.

---

## Current Architecture

```
index.html      — 1830 lines (CSS + HTML + JS all inline)
server.ts       — 78 lines (Bun.serve with static files + Jira proxy)
```

Everything lives in one file: styles (~820 lines), HTML (~170 lines), JS (~830 lines).

---

## Target Architecture

```
jira-dashboard/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .env.example              — Documents required env vars
├── server/
│   └── index.ts              — Hono app (config route + Jira proxy + CORS)
├── tailwind.config.ts        — Tailwind theme (shadcn defaults)
├── components.json           — shadcn/ui config
├── src/
│   ├── main.tsx              — React entry point
│   ├── App.tsx               — Root component + layout shell
│   ├── types.ts              — Shared TypeScript types
│   ├── hooks/
│   │   ├── useJiraApi.ts     — Jira fetch wrapper + auth
│   │   ├── useActivities.ts  — Activity data fetching & filtering
│   │   └── useDateNav.ts     — Date range & period navigation
│   ├── state/
│   │   └── store.ts          — App state (React context + useReducer)
│   ├── components/
│   │   ├── Sidebar.tsx       — Sidebar with project select + member list
│   │   ├── Topbar.tsx        — Period tabs + date nav + actions
│   │   ├── SummaryCards.tsx   — 6 stat cards
│   │   ├── ActivityFeed.tsx   — Activity list with icons
│   │   ├── EpicTree.tsx       — Hierarchical issue tree
│   │   ├── SettingsModal.tsx  — Connection settings form
│   │   └── ui/               — shadcn/ui components (auto-generated)
│   │       ├── avatar.tsx
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── collapsible.tsx
│   │       ├── dialog.tsx
│   │       ├── input.tsx
│   │       ├── progress.tsx
│   │       ├── select.tsx
│   │       ├── sonner.tsx    — Toast notifications
│   │       └── tabs.tsx
│   ├── lib/
│   │   ├── jira.ts           — Jira API client (fetch, auth, pagination)
│   │   ├── tree.ts           — buildTree, filterTreeByMember, countTreeNodes
│   │   ├── dates.ts          — getDateRange, formatDate, humanDate
│   │   └── utils.ts          — cn() helper, escHtml, extractAdfText, getInitials
│   └── styles/
│       └── globals.css        — Tailwind directives + shadcn CSS variables (dark/light)
└── index.html                 — Vite HTML entry (minimal)
```

---

## Migration Phases

### Phase 1: Project Setup
- [ ] Initialize `package.json` with Bun
- [ ] Install dependencies (see Dependencies section below)
- [ ] Configure `vite.config.ts` with dev proxy to backend
- [ ] Configure `tsconfig.json`
- [ ] Configure `tailwind.config.ts` — use shadcn default theme (neutral palette)
- [ ] Initialize shadcn/ui (`bunx shadcn@latest init`) — generates `components.json` and `src/lib/utils.ts` with `cn()` helper
- [ ] Install shadcn/ui components: `bunx shadcn@latest add dialog select tabs card badge avatar button input collapsible progress sonner`
- [ ] Create minimal `index.html` entry for Vite

### Phase 2: Backend — Hono Server
- [ ] Create `server/index.ts` with Hono app (single file — the server is small, no need to split)
  - `/api/config` route (serve env credentials)
  - `/jira/*` proxy (forward requests to Jira with auth)
  - CORS middleware (inline, just 3 headers)
- [ ] Add env validation at startup (warn if missing, don't crash — app falls back to localStorage)
- [ ] Create `.env.example` documenting `ATLASSIAN_URL`, `ATLASSIAN_USERNAME`, `ATLASSIAN_API_TOKEN`
- [ ] Verify proxy works identically to current `server.ts`

### Phase 3: Foundation — Types, Utils, API Client
- [ ] Define TypeScript types in `src/types.ts`
  - `JiraIssue`, `Activity`, `TreeNode`, `Member`, `AppState`
- [ ] Move utility functions → `src/lib/utils.ts`
  - `escHtml`, `extractAdfText`, `getInitials`, `getAvatarColor`
- [ ] Move date helpers → `src/lib/dates.ts`
  - `getDateRange`, `formatDate`, `humanDate`, `navigateDate`
- [ ] Move tree logic → `src/lib/tree.ts`
  - `buildTree`, `filterTreeByMember`, `countTreeNodes`
- [ ] Create Jira API client → `src/lib/jira.ts`
  - `jiraFetch`, `testConnection`, `fetchProjects`, `fetchProjectMembers`, `fetchActivityData`

### Phase 4: State Management
- [ ] Create app store in `src/state/store.ts`
  - Use React Context + useReducer (keeps it simple, no extra deps)
  - Migrate the global `state` object fields
  - Handle localStorage persistence for credentials (fix `jiara_*` typo → use `jira_*` prefix)

### Phase 5: CSS → Tailwind Migration (shadcn defaults)
- [ ] Create `src/styles/globals.css` with Tailwind directives (`@tailwind base/components/utilities`)
- [ ] Use shadcn/ui's default CSS variables (neutral palette, dark/light) — no custom color mapping needed
- [ ] Move scrollbar and animation keyframes → `globals.css`
- [ ] Component-specific styles use Tailwind utility classes (no more raw CSS)
- [ ] Custom utilities (e.g., scrollbar styling) via `@layer utilities` in `globals.css`

### Phase 6: React Components (using shadcn/ui primitives)
UI primitives (`src/components/ui/`) are already installed by shadcn/ui in Phase 1.
Icons via `lucide-react` (installed as shadcn peer dep).
Build app components on top of them:

**Migration complexity notes:**
- ActivityFeed + EpicTree are the hardest — original uses innerHTML string building, must convert to JSX
- Original uses event delegation (click handlers attached after innerHTML) — React handles this naturally with onClick
- Connection status indicator in sidebar footer — don't forget this

- [ ] `SettingsModal.tsx` — wraps shadcn `Dialog` + `Input` + `Button` for credentials form
- [ ] `SummaryCards.tsx` — uses shadcn `Card` for 6 stat cards grid
- [ ] `ActivityFeed.tsx` — activity list with shadcn `Badge` for status icons
- [ ] `EpicTree.tsx` — recursive tree using shadcn `Collapsible` for expand/collapse
- [ ] `Sidebar.tsx` — shadcn `Select` for project dropdown + shadcn `Avatar` for member list
- [ ] `Topbar.tsx` — shadcn `Tabs` for period selection + shadcn `Button` for nav/refresh

### Phase 7: Custom Hooks
- [ ] `useJiraApi` — wraps jira client with loading/error state
- [ ] `useActivities` — fetch + filter activities, rebuild tree on state change
- [ ] `useDateNav` — period/date state, navigation functions

### Phase 8: App Assembly + Toasts
- [ ] `src/App.tsx` — layout grid (sidebar + topbar + main) + `<Toaster />`
- [ ] `src/main.tsx` — React root, wrap with state provider
- [ ] Add toast notifications (using shadcn `sonner`):
  - Connection success/failure
  - Settings saved
  - Data refresh complete/error
  - API errors
- [ ] Wire init flow: load config → check localStorage → auto-connect or show modal

### Phase 9: Cleanup & Verification
- [ ] Delete old `index.html` and `server.ts`
- [ ] Test all features end-to-end:
  - Settings modal → connection test → save
  - Project switching
  - Member filtering
  - Period tabs (daily/weekly/monthly)
  - Date navigation (prev/next/today)
  - Activity feed rendering
  - Epic tree expand/collapse + member filtering
  - Dark/light theme
  - Responsive layout
  - Toast notifications on connect/save/error
- [ ] Verify no regressions in Jira API proxy

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Backend framework | Hono | Lightweight, Bun-compatible, portable |
| Frontend framework | React | Best ecosystem, component model fits the UI |
| Bundler | Vite | Fast HMR, first-class React support, Bun-compatible |
| UI components | shadcn/ui | Not a dependency — copies into project, built on Radix (accessible), fully customizable |
| Styling | Tailwind CSS | Utility-first, pairs with shadcn/ui, easy dark/light theming via CSS variables |
| Theme | shadcn defaults (neutral) | Clean, consistent look out of the box — no custom color mapping needed |
| State management | React Context + useReducer | Simple enough for this app, no extra dependency |
| Notifications | Sonner (via shadcn) | Toast notifications for connect, save, refresh, and errors |
| TypeScript | Yes | Type safety for Jira API responses and state |

---

## shadcn/ui Component Mapping

| Current UI Element | shadcn/ui Component | Notes |
|---|---|---|
| Settings modal overlay + form | `Dialog` + `Input` + `Button` | Replace manual modal open/close with Dialog state |
| Project dropdown | `Select` | Replace `<select>` with accessible Select |
| Period tabs (daily/weekly/monthly) | `Tabs` | Replace click-delegation with Tabs component |
| Summary stat cards | `Card` | 6-card grid layout |
| Member avatars (initials + color) | `Avatar` + `AvatarFallback` | Keep custom color logic, use Avatar shell |
| Status/type badges | `Badge` | Epic/Task/Subtask type labels |
| Tree expand/collapse | `Collapsible` | Replace manual toggle with Collapsible state |
| Loading bar | `Progress` | Top-of-page indeterminate progress |
| Refresh/settings buttons | `Button` | Icon buttons with variants |
| Credential inputs | `Input` | URL, email, token fields |

---

## Dependencies to Install

```bash
# Runtime
bun add react react-dom hono

# Dev
bun add -d vite @vitejs/plugin-react @types/react @types/react-dom typescript tailwindcss @tailwindcss/vite

# shadcn/ui setup (after project init)
bunx shadcn@latest init
bunx shadcn@latest add dialog select tabs card badge avatar button input collapsible progress sonner
```

---

## Dev Workflow

```bash
# Terminal 1: Backend
bun run server/index.ts

# Terminal 2: Frontend (Vite dev server with proxy)
bun run vite
```

Vite config will proxy `/api/*` and `/jira/*` to the Hono backend during development. In production, Hono serves the built Vite output from `dist/`.

---

## Claude Code Execution Strategy

### Tools & Techniques to Use

#### Context7 — Up-to-date Documentation
Fetch latest docs before writing code for each library. This avoids using stale APIs.

| When | Query |
|---|---|
| Phase 1 | `resolve-library-id` → Vite, then `query-docs` for Vite + React config |
| Phase 1 | `resolve-library-id` → Hono, then `query-docs` for Hono Bun setup |
| Phase 1 | `resolve-library-id` → shadcn/ui, then `query-docs` for init + component installation |
| Phase 1 | `resolve-library-id` → Tailwind CSS, then `query-docs` for setup with Vite (check v3 vs v4 shadcn compat) |
| Phase 2 | `query-docs` Hono routing, middleware, proxy patterns |
| Phase 4 | `query-docs` React useReducer + Context patterns |
| Phase 5 | `query-docs` Tailwind CSS theming, dark mode, CSS variables |
| Phase 6 | `query-docs` shadcn/ui Dialog, Select, Tabs, Collapsible, Card usage |
| Phase 6 | `query-docs` React component patterns, hooks API |

Always resolve the library ID first, then query docs with a focused topic.

#### Sequential Thinking — Complex Decision Points
Use `mcp__sequential-thinking__sequentialthinking` for multi-step reasoning at key moments:

- **Phase 3**: Designing the `types.ts` type hierarchy — Jira API responses are nested and complex, think through the shape before coding
- **Phase 4**: State management architecture — which state goes in context vs local, what triggers re-renders
- **Phase 6**: `EpicTree.tsx` recursive component — the tree filtering + expand/collapse logic needs careful thought
- **Phase 8**: Init flow orchestration — config loading → auth → project fetch → data fetch sequence

#### Agent Teams — Parallel Workstreams
Use agent teams to parallelize independent work across phases:

| Parallel Group | Agent 1 | Agent 2 | Agent 3 |
|---|---|---|---|
| **Phase 1+2** | Project setup (package.json, configs) | Hono server + routes | — |
| **Phase 3** | Types + utils (`types.ts`, `utils.ts`, `dates.ts`) | Jira API client (`jira.ts`, `tree.ts`) | — |
| **Phase 5+6a** | CSS migration (`globals.css`) | SettingsModal + SummaryCards | Sidebar + Topbar |
| **Phase 6b** | Sidebar + Topbar | SummaryCards + ActivityFeed | EpicTree |
| **Phase 7+8** | Custom hooks | App assembly + main entry | — |

Each agent should be given clear file boundaries so they don't conflict.

#### Worktrees — Isolated Branches
Use `isolation: "worktree"` for risky or experimental work:

- **Phase 6**: Build `EpicTree.tsx` (most complex component) in a worktree — test the recursive rendering independently
- **Phase 9**: Final integration testing in a worktree — catch issues before touching main

Worktrees let agents work on isolated git branches without affecting each other.

#### Skills — Specialized Workflows
Invoke these skills at the right moments:

| Skill | When | Purpose |
|---|---|---|
| `/feature-dev` | Phase 2, 6, 7 | Guided feature development with codebase understanding |
| `/ui-ux-pro-max` | Phase 5, 6 | Ensure components maintain the current polished design quality |
| `/simplify` | After each phase | Review changed code for reuse, quality, and efficiency |
| `/claude-api` | If adding AI features later | Anthropic SDK integration |

#### Code Review Agents
After each phase, spawn a `feature-dev:code-reviewer` agent to catch:
- Logic errors in the migration (did we miss any behavior from the monolith?)
- Security issues (XSS, credential exposure)
- TypeScript type mismatches

#### Code Explorer Agents
Use `feature-dev:code-explorer` at the start to:
- Trace the full data flow from Jira API → state → render
- Map all event listener attachment points (these are easy to miss during migration)
- Document the localStorage key scheme (`jiara_*` prefix)

---

## Execution Order Summary

```
1. Sequential Thinking  → Plan type hierarchy + state shape
2. Context7             → Fetch Hono, Vite, React, shadcn/ui, Tailwind docs
3. Agent Team           → Phase 1+2 in parallel (setup + server)
4. /simplify            → Review Phase 1+2 output
5. Agent Team           → Phase 3 in parallel (types + utils | API client)
6. Agent Team           → Phase 4+5 in parallel (state | CSS with shadcn defaults)
7. Context7             → Fetch React component/hooks + shadcn component docs
8. Agent Team (worktree) → Phase 6 components in 3 parallel agents
9. /ui-ux-pro-max       → Verify design quality and polish
10. Agent Team          → Phase 7+8 (hooks | assembly + toasts)
11. Code Review Agent   → Full migration review
12. Worktree            → Phase 9 integration test (inc. toasts)
13. /simplify           → Final cleanup pass
```
