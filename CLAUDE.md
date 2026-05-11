# Delta Celphei — Claude Code Project

## Project Overview

**Delta Celphei** (shortened: **Celphei**) is an ITSM ticketing application — a sister app to [Polaris](https://github.com/davidmoore-rogers/polaris). It provides incidents, changes, requests, sub-tasks, rule-based approvals, and native Polaris asset linking, with a setup wizard, multi-role RBAC, and pluggable auth (local + SAML/OIDC/LDAP/Polaris federation in Phase 3).

**Phase 1 ships:** monorepo scaffold, setup wizard (copied from Polaris's `setupServer` pattern), session auth + Argon2id local accounts, multi-role RBAC (Admin/Manager/HelpDesk/User), ticket+task CRUD with comments and history, Polaris asset client + linking, universal ⌘K search, events page with SSE live tail, Settings (Customization + API Tokens).

**Version policy:** `<major>.<minor>` lives in `package.json` and is the single source of truth. Pre-release line is `0.x`. Patch is reserved for the git commit count when the runtime version helper lands (Phase 2+); for now `package.json` is `0.1.0`.

---

## Architecture

```
delta-celphei/
├── CLAUDE.md
├── touches.md                       # Lookup index: per-service writers/readers/invariants + cross-cutting concerns. Reviewed alongside CLAUDE.md and primaries.md on every commit.
├── primaries.md                     # Canonical-implementation index: when multiple ways exist to build the same thing (modal, dynamic form, route handler, ...), this names the reference implementation new work should match.
├── README.md
├── .env.example
├── package.json                     # workspaces: ["apps/*", "packages/*"]
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docker-compose.yml               # postgres:15-alpine for local dev
├── Dockerfile                       # multi-stage (deps → build → runtime), node:20-bookworm-slim
├── .gitignore  .dockerignore  .eslintrc.cjs  .prettierrc
├── apps/
│   ├── api/                         # Express 5 + TS backend (port 3000)
│   │   ├── package.json
│   │   ├── tsconfig.json            # declaration: false (apps don't emit .d.ts — required for the inferred Router type)
│   │   ├── prisma/
│   │   │   ├── schema.prisma        # Phase 1 schema + Phase 2+ tables defined now
│   │   │   ├── seed.ts              # runs src/seed/builtInTypes.ts via tsx
│   │   │   └── seedFns.ts           # re-export shim → src/seed/builtInTypes
│   │   ├── public/                  # Vanilla wizard UI (only files served in bootstrap mode)
│   │   │   ├── setup.html           # 8-step wizard, in-memory state, no URL routing
│   │   │   ├── setup.css            # Mirrors Polaris's wizard CSS class names + tokens
│   │   │   └── js/setup.js          # currentStep + .step-panel.visible toggle pattern
│   │   └── src/
│   │       ├── index.ts             # Entry point — calls getSetupState(), branches to setupServer or app
│   │       ├── app.ts               # Express factory (normal mode): middleware chain, route mount, error handler, SPA fallback
│   │       ├── config/env.ts        # zod-validated env; loads state/.env first
│   │       ├── db/prisma.ts         # Lazy PrismaClient singleton
│   │       ├── auth/
│   │       │   ├── middleware.ts    # sessionResolver, csrfGuard, requireAuth, requireRole, requireManagerOf — declares Express.Request augmentation
│   │       │   ├── sessions.ts      # SHA-256 token, PG-backed, sliding 8h, csrfSecret per session
│   │       │   ├── passwords.ts     # Argon2id hash/verify
│   │       │   └── providers.ts     # authenticateLocal + listEnabledProviders (Phase 3 plugs in saml/oidc/ldap/polaris here)
│   │       ├── events/bus.ts        # emitEvent() writer + in-process EventEmitter; consumed by /events SSE stream
│   │       ├── integrations/polaris.ts  # PolarisAssetClient: env wins over DB IntegrationConnection; 5-min LRU cache
│   │       ├── middleware/errorHandler.ts  # HttpError + ZodError translator, JSON error envelope
│   │       ├── observability/
│   │       │   ├── logger.ts        # Pino, dev pretty, prod JSON; redacts secrets
│   │       │   └── metrics.ts       # prom-client registry, celphei_ prefix
│   │       ├── routes/v1/           # one file per resource
│   │       │   ├── auth.ts          # /login /logout /me /providers /csrf
│   │       │   ├── tickets.ts       # CRUD + /:id/comments /:id/history /:id/assets /:id/tasks
│   │       │   ├── tasks.ts         # individual task GET/PATCH/DELETE
│   │       │   ├── ticketTypes.ts   # list/get + admin patch (Phase 2 wires full CRUD)
│   │       │   ├── users.ts         # /me + admin list/create + /:id/roles
│   │       │   ├── teams.ts         # CRUD + /:id/members
│   │       │   ├── managerReports.ts  # direct-report mapping (manual override; Entra/AD sync in Phase 3)
│   │       │   ├── polaris.ts       # asset search + by-id proxy
│   │       │   ├── search.ts        # universal search fan-out (tickets/tasks/users/assets)
│   │       │   ├── events.ts        # paginated list + /stream (SSE)
│   │       │   ├── settings.ts      # /customization GET/PATCH
│   │       │   └── apiTokens.ts     # CRUD; secret shown ONCE on create
│   │       ├── services/
│   │       │   ├── tickets.ts       # createTicket, updateTicket, listTickets, getTicket; ticket-number sequence per type; tasksBlockClose enforcement; UncheckedUpdateInput for scalar FKs
│   │       │   └── tasks.ts         # createTask, updateTask, deleteTask; TSK-#### sequence; completedAt invariant
│   │       ├── seed/
│   │       │   └── builtInTypes.ts  # Idempotent upsert of Incident / Change / Request types with default schemas
│   │       ├── setup/               # Bootstrap mode (copied verbatim from Polaris's setupServer pattern)
│   │       │   ├── detectSetup.ts   # configured | locked | needs-setup resolver
│   │       │   ├── setupServer.ts   # Minimal Express app — no Prisma client; serves wizard + /api/setup/*
│   │       │   └── setupRoutes.ts   # test-connection / preflight / generate-secret / test-polaris / test-directory / test-smtp / finalize. Atomic finalize: createDB + write state/.env + prisma migrate deploy + Prisma transaction (admin/setting/integrations) + .setup-complete marker + process.exit(0)
│   │       └── utils/paths.ts       # API_ROOT, STATE_DIR, SETUP_COMPLETE_MARKER, ENV_FILE, PUBLIC_DIR, WEB_DIST — single source of truth for runtime-state paths
│   └── web/                         # React 18 + Vite + Tailwind SPA (dev port 5173)
│       ├── package.json
│       ├── tsconfig.json            # declaration: false (same reason as api)
│       ├── vite.config.ts           # /api + /health proxied to localhost:3000
│       ├── tailwind.config.ts       # darkMode: media; brand/surface/ink/edge tokens from CSS custom properties
│       ├── postcss.config.cjs
│       ├── index.html
│       └── src/
│           ├── main.tsx             # React root + QueryClientProvider + RouterProvider
│           ├── index.css            # CSS custom-property tokens + @tailwind directives
│           ├── app/
│           │   ├── routes.tsx       # createBrowserRouter — top-level RequireAuth gate wraps the AppShell tree
│           │   ├── guards.tsx       # RequireAuth (Navigate to /login on 401), RequireRole (in-shell forbidden message)
│           │   └── AppShell.tsx     # Header (logo + ⌘K search button + avatar/logout) + role-aware sidebar + <Outlet/> + CommandPalette
│           ├── features/
│           │   ├── auth/LoginPage.tsx
│           │   ├── dashboard/Dashboard.tsx       # KPIs + assigned-to-me + open-tickets panels
│           │   ├── tickets/
│           │   │   ├── TicketList.tsx            # Filter chips + paginated table
│           │   │   ├── NewTicket.tsx             # Dynamic form rendered from TicketType.schema (FieldRenderer)
│           │   │   └── TicketDetail.tsx          # Header + Description + TasksPanel + CommentsPanel + sidebar (Status changer, linked assets, approvals placeholder)
│           │   ├── search/CommandPalette.tsx     # ⌘K modal; 200ms debounce; ↑↓/Enter/Esc keys; opens asset hits in new tab
│           │   ├── team/MyTeamPage.tsx           # Manager view: direct-report list + their tickets (per-report fan-out until Phase 2 ?assigneeIn=...)
│           │   ├── events/EventsPage.tsx         # Admin-only; severity/source filters; Live toggle subscribes to /api/v1/events/stream
│           │   ├── settings/
│           │   │   ├── SettingsLayout.tsx        # 5-tab shell — Customization / Time & NTP / Certificates / Maintenances / API Tokens
│           │   │   ├── Customization.tsx         # Phase 1 — org name, primary color, login banner, default tz
│           │   │   ├── ApiTokens.tsx             # Phase 1 — create/revoke; secret revealed ONCE on create
│           │   │   └── ComingSoon.tsx            # Placeholder for Phase 2 tabs (Time/NTP, Certificates, Maintenances)
│           │   └── admin/
│           │       ├── AdminUsers.tsx            # Role chip editor (multi-role assign)
│           │       └── AdminTeams.tsx            # Team CRUD
│           ├── lib/
│           │   ├── api.ts           # fetch wrapper: credentials: "include", attaches X-CSRF-Token on mutations, JSON error envelope translator
│           │   ├── auth.ts          # useMe() hook — fetches /api/v1/auth/me, stashes csrfToken in api module
│           │   └── queryClient.ts   # TanStack Query — refetchOnWindowFocus: false, 15s staleTime
│           └── stores/uiStore.ts    # Zustand — sidebarCollapsed, paletteOpen
└── packages/
    └── shared/                      # @celphei/shared — runtime-shared zod schemas + DTOs + enums
        ├── package.json             # exports ./src/index.ts directly (no build step needed for consumers; tsx + Vite both handle .ts source)
        └── src/
            ├── index.ts             # barrel
            ├── enums.ts             # Role, TicketStatus, Priority, TaskStatus, AuthProviderType, EventSeverity, IntegrationKind, BUILTIN_TICKET_TYPES
            └── schemas/
                ├── user.ts          # UserDTO, CreateUserInput, UpdateUserRolesInput, LoginInput, validatePasswordComplexity
                ├── ticket.ts        # TicketDTO, CreateTicketInput, UpdateTicketInput, ListTicketsQuery, TicketTypeFieldSchema, TicketTypeDTO, PolarisAssetRefDTO
                ├── task.ts          # TaskDTO, CreateTaskInput, UpdateTaskInput
                ├── comment.ts       # TicketCommentDTO, CreateTicketCommentInput, TicketHistoryDTO
                ├── event.ts         # EventDTO, ListEventsQuery
                ├── search.ts        # SearchHitDTO (discriminated by `kind`), SearchResponse, SearchScope
                ├── setting.ts       # SettingDTO, UpdateSettingInput, ApiTokenDTO, CreateApiTokenInput, CreateApiTokenResponse
                └── setup.ts         # DbConnectionInput, AdminAccountInput, AppSettingsInput, OrgSetupInput, PolarisSetupInput, DirectorySetupInput, MailSetupInput, FinalizeSetupInput, TestConnectionResponse, FinalizeSetupResponse
```

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | Node.js 20+, ESM | Matches Polaris; modern LTS |
| Language | TypeScript 5 strict | `noUncheckedIndexedAccess`, `noImplicitReturns` on |
| HTTP | Express 5 (5.0.0-beta.3) | Express 5 typings made `req.params.x` `string \| string[] \| undefined` — see "Route handler param access" convention below |
| DB | PostgreSQL 15, Prisma 5 | Same as Polaris (Polaris is on Prisma 7 — we upgrade in tandem when a forcing function arrives) |
| Auth | Argon2id, opaque-token sessions, `X-CSRF-Token` double-submit | Mirrors Polaris |
| Logging | Pino + pino-pretty (dev) + pino-http | Matches Polaris |
| Metrics | prom-client, `celphei_*` prefix | Matches Polaris's `polaris_*` convention |
| Validation | Zod, schemas in `@celphei/shared` | API and web share the source of truth |
| Frontend | React 18 + Vite + Tailwind + TanStack Query + Zustand + React Router (data routers) | Best fit for ⌘K palette, dynamic forms, ticket detail panels |
| Package mgmt | pnpm workspaces (9.x) | Strict hoisting catches accidental cross-package imports |
| Container | Multi-stage Dockerfile (deps → build → runtime), tini for PID 1 | Mirrors Polaris layout |

---

## Conventions

### 1. Setup wizard is the source of truth for first-run config
Wizard files live under `apps/api/src/setup/` + `apps/api/public/`. The wizard flow is **8 steps**: Database → Admin → App settings → Org → Polaris → Directory → Mail → Review. Steps 1–3 are required; steps 4–7 are skippable. Finalize is atomic: createDB + write `state/.env` + `prisma migrate deploy` + single Prisma transaction (admin user, Setting singleton, IntegrationConnection rows) + write `state/.setup-complete` marker + `process.exit(0)`. **A crash mid-finalize leaves the system in `needs-setup` state** because the marker is written last. The marker file format is `{ configuredAt }`.

`DATABASE_URL` env var wins over the wizard — operators running in Docker/K8s with secrets bypass the GUI install. `state/.setup-complete` present + `DATABASE_URL` unset = `locked` (refuse boot) to prevent re-provisioning over a live install.

### 2. State directory is `state/`
Anything that persists across process restarts but isn't in the DB lives in `state/`: `.env` (written by the wizard finalize), `.setup-complete` marker, future backup bundles. `apps/api/src/utils/paths.ts` is the single source of truth. `STATE_DIR` env var overrides; the Dockerfile sets it to `/app/state` and exposes it as a volume.

### 3. Sessions: opaque token, SHA-256 stored
- Cookie name: `__Host-celphei.sid`, HttpOnly, Secure in production, SameSite=Lax.
- Server stores `sha256(token)` as `Session.id`; `Session.csrfSecret` is a separate opaque token bound to the session.
- 8h sliding expiry — every authenticated request bumps `expiresAt` + `lastSeenAt`.
- CSRF: any mutation (POST/PUT/PATCH/DELETE) with a session cookie requires a matching `X-CSRF-Token` header. Bearer-token (API key) requests bypass CSRF — the token IS the credential.

### 4. RBAC is multi-role + manager-scoped
`UserRoleAssignment` is a join table — every user can hold any subset of `{Admin, Manager, HelpDesk, User}`. Routes guard with `requireRole(...roles)` (any-of). Manager scoping uses `requireManagerOf(req, targetUserId)` which is true if requester is Admin OR has a `ManagerReport` link to the target. Manager→report mapping precedence is **manual > entra > ad** (manual survives directory sync — Phase 3).

### 5. Event bus is the audit log
Every meaningful action calls `emitEvent({ source, severity, actorId, subject, message, data })`. The writer (`apps/api/src/events/bus.ts`) does two things: persists the `Event` row and fires a Node EventEmitter so the `/api/v1/events/stream` SSE subscribers can push to connected admins. `TicketHistory` is the ticket-scoped audit trail (lives next to the ticket); `Event` is the global activity log.

### 6. REST conventions
Mount under `/api/v1/<plural-resource>`. Standard error envelope `{ error: { code, message, details? } }`. Validate input with zod schemas imported from `@celphei/shared`. Use `Prisma.<X>UncheckedUpdateInput` when an update needs to write scalar FKs directly (e.g., `assigneeId`, `teamId`) — the strict `UpdateInput` shape forces `assignee: { connect: { id } }` which is verbose for our use.

### 7. Route handler param access
Express 5 typings declare `req.params.x` as `string | string[] | undefined`. Pattern: `const id = req.params.id as string;` at the top of the handler. Don't sprinkle `as string` at usage sites — read once at the top.

### 8. Implicit-return guard on route handlers
TypeScript `noImplicitReturns` flags handlers that early-return on one branch but fall through on another. Pattern: annotate the handler return type explicitly (`async (req, res, next): Promise<void> =>`) and use `res.json(...); return;` instead of `return res.json(...)` so all branches return `void` consistently.

### 9. Express.Request augmentation
`apps/api/src/auth/middleware.ts` declares `declare global { namespace Express { interface Request { session?: SessionContext; apiToken?: ... } } }`. Do NOT switch to a `declare module "express-serve-static-core"` augmentation — that fails under Express 5's types layout. If you need additional per-request state, extend this same block.

### 10. Frontend ⌘K is the universal search entry point
`features/search/CommandPalette.tsx` is mounted inside `AppShell` and listens for `Cmd/Ctrl+K` globally. The backend `/api/v1/search?q=&scope=` fans out to tickets + tasks + users + Polaris (proxied). Don't build a per-page search box if a use case fits ⌘K — extend the palette.

### 11. Dynamic ticket form
The single renderer in `features/tickets/NewTicket.tsx#renderInput()` maps `TicketType.schema.fields[].type` (`text|textarea|number|select|date|user|asset`) to shadcn-style inputs. New field types go here, not in per-ticket-type components.

### 12. Polaris asset references are snapshots
`PolarisAssetRef` stores `polarisAssetId` + cached `name` + cached `type` + `lastSyncedAt`. **The ticket detail render always uses the cached snapshot** so the page doesn't block on Polaris's availability. Stale data refreshes async on read when Polaris is healthy (Phase 4 wires the async refresh; Phase 1 just caches what the client returned on create). Never join across DBs — Polaris is on its own Postgres.

### 13. Sub-task closure semantics
`TicketType.tasksBlockClose` is admin-configurable per type. Built-in defaults: `Incident=false`, `Change=true`, `Request=false`. `services/tickets.updateTicket` enforces: closing a ticket while `tasksBlockClose=true` AND at least one task is not Done/Cancelled throws `conflict(...)` (409). Task statuses: `Open | InProgress | Done | Cancelled`. `completedAt` is set when status flips to Done, cleared if Done is reversed.

### 14. Settings is a singleton
`Setting` is a single row with `id: 1` enforced by `@default(1) @id`. The setup wizard upserts it. `settings/customization` route updates fields directly; the row never has more than one entry.

### 15. Built-in ticket types are idempotent-seeded
`apps/api/src/seed/builtInTypes.ts` is called from two places: (a) the wizard's finalize transaction (so a fresh install has them immediately), and (b) `pnpm db:seed` via `apps/api/prisma/seed.ts` (so devs can re-seed against an existing DB). Both upsert by `slug` and only update the `name + isBuiltIn` flag — operator customizations to `prefix`, `schema`, `tasksBlockClose` survive re-seeds.

### 16. Before any commit: read CLAUDE.md, touches.md, primaries.md
Three files form the architecture record. If your change moves a service boundary, breaks an invariant, or replaces a canonical implementation, **update the relevant file in the same commit**. This is the only mechanism keeping regression-prone relationships visible without rereading every consumer.

---

## Phasing

Phase 1 (current): foundation + wizard + auth + tickets/tasks/comments/history + Polaris client + ⌘K search + events + Customization & API Tokens settings tabs + Admin (users/teams).

Phase 2: rule-based approval engine + admin UI for ticket types and approval rules + dynamic custom-fields rendering + groups + remaining settings tabs (Time/NTP, Certificates, Maintenances).

Phase 3: SAML/OIDC/LDAP/Polaris-federation auth providers; Entra ID sync (incl. `manager` attribute → `ManagerReport`); Intune device lookup; AD sync; encrypted-at-rest IntegrationConnection secrets (AES-256-GCM using `ENCRYPTION_KEY`).

Phase 4: attachments (local FS → S3 adapter); email notifications (nodemailer via pg-boss); SLA tracking; dashboards with charts; task reordering & dependencies.

---

## Development workflow

```bash
pnpm install
docker compose up -d postgres
# First time: skip prisma migrate; let the setup wizard create the DB and run migrations.
pnpm dev    # API on :3000 + Vite on :5173 in parallel
```

Visit `http://localhost:3000/` — the wizard appears because `DATABASE_URL` is unset and `state/.setup-complete` doesn't exist. Complete the 8 steps; the process exits and your container/devloop restarts the API into normal mode. Browse `http://localhost:5173/login`.

After setup, the SPA dev server proxies `/api` and `/health` to the API.

Common commands:
- `pnpm typecheck` — both apps + shared package
- `pnpm lint`
- `pnpm test` — Vitest (Phase 1 has no tests yet; Phase 2 lands the approval-engine unit tests)
- `pnpm db:migrate` — `prisma migrate dev` against your local DB (after the wizard has written `state/.env`)
- `pnpm db:seed` — re-seed built-in ticket types
- `pnpm db:studio` — Prisma Studio

The Docker image (`docker compose --profile prod up api`) needs only one bind mount: `/app/state`. `DATABASE_URL` provided via env wins over the wizard.
