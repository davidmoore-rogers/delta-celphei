# Delta Celphei

ITSM ticketing application — sister app to [Polaris](https://github.com/davidmoore-rogers/polaris). Provides incidents, changes, requests, sub-tasks, rule-based approvals, and native Polaris asset linking.

## Stack

- **Backend:** Node 20, TypeScript, Express 5, Prisma, PostgreSQL 15
- **Frontend:** React 18, Vite, Tailwind, shadcn/ui, TanStack Query, Zustand, React Router
- **Monorepo:** pnpm workspaces

## Quick start

```bash
pnpm install
docker compose up -d postgres
pnpm dev
```

On first run the app boots into the **setup wizard** at `http://localhost:3000/setup` — it collects the DB credentials, creates an admin account, and writes `state/.env`. After commit the process exits and the container/devloop restarts the app into normal mode.

Once setup is complete, the SPA is served from `http://localhost:5173` (dev) or `http://localhost:3000` (prod).

## Workspaces

- `apps/api` — Express API + setup wizard backend
- `apps/web` — React SPA
- `packages/shared` — zod schemas, DTOs, enums shared between API and web

## Scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Run API + web in watch mode |
| `pnpm build` | Production build of all packages |
| `pnpm test` | Run all unit + integration tests |
| `pnpm lint` | ESLint across the monorepo |
| `pnpm typecheck` | TypeScript compile check |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:seed` | Seed built-in ticket types |
| `pnpm db:studio` | Open Prisma Studio |

## Documentation

The current implementation plan lives at `C:\Users\dmoore\.claude\plans\i-want-to-make-polished-dahl.md`.
