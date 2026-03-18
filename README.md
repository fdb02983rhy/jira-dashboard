# Jira Dashboard

A real-time activity dashboard for Jira Cloud. Track team member activity, spot stale issues, and monitor unassigned work across your projects.

## Features

- **Activity Feed** — see all changes (status, assignee, comments, dates) in a rolling time window
- **Changed Issues Tree** — hierarchical view (Epic > Task > Subtask) of issues with changes
- **Dashboard Summary** — project overview with member activity ranking, daily activity chart, stale issue counts, and unassigned issues
- **Stale Issues** — find issues assigned to members that haven't been updated
- **Unassigned Issues** — spot open issues with no assignee
- **Member Filtering** — click any member to drill into their activity
- **Rolling Windows** — daily (1 day), weekly (last 7 days), monthly (last 30 days)

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime
- Jira Cloud instance with an [API token](https://id.atlassian.com/manage-profile/security/api-tokens)

### Setup

```bash
# Clone and install
git clone https://github.com/user/jira-dashboard.git
cd jira-dashboard
bun install

# Configure credentials
cp .env.example .env
# Edit .env with your Jira URL, email, and API token

# Run
bun run dev
```

Open http://localhost:5173

### Docker

```bash
cp .env.example .env
# Edit .env with your credentials

docker compose up
```

Open http://localhost:3456

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Backend**: [Hono](https://hono.dev) (port 3456)
- **Frontend**: React + [Vite](https://vitejs.dev) + [Tailwind CSS](https://tailwindcss.com) v4 + [shadcn/ui](https://ui.shadcn.com)
- **Charts**: [Recharts](https://recharts.org)
- **Cache**: SQLite (via `bun:sqlite`) with TTL-based invalidation
- **Linter**: [Biome](https://biomejs.dev)

## Development

```bash
bun run dev        # Start Vite + Hono backend
bun run lint:fix   # Lint and format with Biome
bun run typecheck  # TypeScript type checking
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ATLASSIAN_URL` | Jira Cloud instance URL (e.g. `https://yourorg.atlassian.net`) |
| `ATLASSIAN_USERNAME` | Email address of your Atlassian account |
| `ATLASSIAN_API_TOKEN` | [API token](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `DB_PATH` | SQLite database path (default: `server/cache.db`) |

## License

MIT
