# Jira Dashboard

## Stack
- **Runtime**: Bun
- **Backend**: Hono (`server/index.ts`, port 3456)
- **Frontend**: React + Vite + Tailwind v4 + shadcn/ui
- **Linter/Formatter**: Biome (`bun run lint:fix`)

## Commands
```sh
bun run dev        # Vite + Hono backend (both)
bun run lint:fix   # Biome lint + format
```

## Rules
- Never use `any`. Use `unknown` + type narrowing.
- Run `bun run lint:fix` after writing code.
- shadcn/ui components live in `src/components/ui/` — don't edit them directly.
- State uses React Context + useReducer in `src/state/store.tsx`.
- All Jira API calls go through the `/jira/*` proxy via `src/lib/jira.ts`.
- Use `@/` path alias for imports (maps to `src/`).
