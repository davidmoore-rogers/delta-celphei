# Delta Celphei — Touches Index

A lookup index for cross-cutting invariants and per-service relationships in the Celphei codebase. Answers the question **"if I change X, what else touches it?"** without reading every consumer.

This file complements [CLAUDE.md](CLAUDE.md) — CLAUDE.md is the narrative architecture doc; this is the relationship/dependency map.

## How to use

1. **Before changing a service or shared invariant**, find its section here.
2. Walk the **Used by** / **Writers** / **Readers** lists to see what depends on the thing you're touching.
3. Run through the **When changing this** checklist before opening a PR.
4. **Keep this file current.** Per CLAUDE.md's commit-review rule, every commit re-reads `touches.md` for staleness — if your change moved writers/readers, broke an invariant, or invalidated a checklist item, fix it in the same commit.

## Format

**Per-service** sections:
- **What it owns** — one-sentence responsibility
- **Public API** — exported symbols
- **Cross-service deps** — other files this one imports
- **Used by** — external callers (`file:symbol — purpose`)
- **Invariants** — rules every caller must respect
- **When changing this** — pre-merge checklist

**Cross-cutting** sections swap **Used by** for separate **Writers** / **Readers** lists.

## Sections

- [Cross-cutting concerns](#cross-cutting-concerns) (7)
- [Per-service touches](#per-service-touches) — alphabetical

---

# Cross-cutting concerns

## cross-cutting/setup-completion-marker

**What it is:** First-run gate. `apps/api/state/.setup-complete` JSON marker (`{ configuredAt }`) + `DATABASE_URL` env var presence collectively determine whether the API boots into the wizard (`setupServer`) or the normal app (`app.ts`).

**Writers:**
- `apps/api/src/setup/setupRoutes.ts:finalizeSetup()` — writes the marker LAST in the finalize flow, after the Prisma transaction commits. A crash before this leaves the system in `needs-setup`.

**Readers:**
- `apps/api/src/setup/detectSetup.ts:getSetupState()` — returns `configured` / `locked` / `needs-setup` based on `DATABASE_URL` (env wins) + marker existence.
- `apps/api/src/index.ts:main()` — branches on the state. `needs-setup` → `startSetupServer()`. `locked` → `process.exit(2)` with a fatal log. `configured` → `startApp()`.

**Invariants:**
- The marker is written AFTER the Prisma transaction succeeds. Order matters — a crash mid-finalize must leave the system in `needs-setup`, never half-set-up.
- `DATABASE_URL` set + marker absent = `configured` (env wins; matches Docker/K8s deployments).
- `DATABASE_URL` unset + marker present = `locked` (refuse boot — would corrupt the existing install). Operator removes the marker manually to re-provision (destructive).
- The marker location is `state/.setup-complete` resolved by `apps/api/src/utils/paths.ts`. `STATE_DIR` env var overrides; the Docker image sets it to `/app/state`.

**When changing this:**
- Marker schema changes need a versioning story (Polaris's lesson — see its `SHELOB1\0`/`POLARIS\0` rebrand). For now only `configuredAt` is read.
- If you add new wizard steps that need to persist before marker write, do so INSIDE the same Prisma transaction in `finalizeSetup`. Steps that touch the filesystem (env file writes) happen BEFORE the transaction so a transaction failure rolls back without leaving stale files.

---

## cross-cutting/session-and-csrf

**What it is:** Session-cookie auth (`__Host-celphei.sid`) + double-submit CSRF (`X-CSRF-Token`). Backbone of every authenticated mutation.

**Writers** (places that create or destroy sessions):
- `apps/api/src/routes/v1/auth.ts:POST /login` — calls `createSession()` after `authenticateLocal()` succeeds, sets the cookie, returns `csrfToken` in the body.
- `apps/api/src/routes/v1/auth.ts:POST /logout` — calls `destroySession()`, clears the cookie.
- `apps/api/src/auth/sessions.ts:createSession() / destroySession() / loadSession()` — only writers; called from auth routes and middleware.
- `apps/api/src/auth/sessions.ts:loadSession()` — also writes (bumps `expiresAt + lastSeenAt` on each request — sliding expiry).

**Readers:**
- `apps/api/src/auth/middleware.ts:sessionResolver` — every request runs through this; reads `req.cookies[SESSION_COOKIE]` or `Authorization: Bearer ...`, sets `req.session` and `req.apiToken`.
- `apps/api/src/auth/middleware.ts:csrfGuard` — every mutation runs through this; reads `req.headers["x-csrf-token"]` and `req.session.csrfSecret`, rejects on mismatch.
- `apps/api/src/auth/middleware.ts:requireAuth / requireRole / requireManagerOf` — all read `req.session`.
- `apps/web/src/lib/api.ts:api()` — every fetch reads the CSRF token (stashed via `setCsrfToken` after `useMe()` / `login.mutate()`) and attaches `X-CSRF-Token` on mutations.
- `apps/web/src/lib/auth.ts:useMe()` — calls `/api/v1/auth/me`, stashes the returned `csrfToken` for subsequent mutations.

**Invariants:**
- Cookie is `__Host-` prefixed (no `Domain` attribute; `Secure` required in prod; `Path=/`).
- Session token stored hashed (SHA-256). The plaintext token NEVER lives in the DB — it goes out in the cookie and the server never sees it again until the next request.
- `Session.csrfSecret` is per-session; rotated only when the session is destroyed and recreated.
- Bearer-token (API key) requests bypass CSRF (the token is the credential). `csrfGuard` early-returns when `req.apiToken` is set.
- `/api/v1/auth/login` and `/api/v1/auth/logout` are CSRF-exempt (no session yet on login; destroying it on logout).
- Constant-time CSRF compare via `crypto.timingSafeEqual` in `csrfTokensMatch()`.

**When changing this:**
- Don't move `sessionResolver` after `csrfGuard` — the guard reads `req.session`, the resolver populates it.
- Don't store the plaintext session token anywhere on the server side. If you need to look up a session by token, hash first.
- If you add a new mutation-style HTTP method (e.g. PURGE), add it to `MUTATION_METHODS` in `auth/middleware.ts`.
- New routes that should accept API tokens but NOT browser sessions: check `req.apiToken` explicitly and reject if absent. Routes that should accept both don't need any extra code.

---

## cross-cutting/role-and-manager-scope

**What it is:** Multi-role RBAC + Manager→report scope check.

**Writers** (places that mutate role/scope state):
- `apps/api/src/routes/v1/users.ts:POST /` — creates a User with initial roles via nested `roles: { create: [...] }`.
- `apps/api/src/routes/v1/users.ts:PATCH /:id/roles` — replaces a user's roles atomically (delete all + createMany inside a `$transaction`).
- `apps/api/src/routes/v1/managerReports.ts:POST /` — manual upsert of a manager→report link (`source = "manual"`).
- `apps/api/src/setup/setupRoutes.ts:finalizeSetup()` — creates the admin user and grants `Admin` + `User` roles in the finalize transaction.

**Readers:**
- `apps/api/src/auth/middleware.ts:requireRole(...roles)` — every guarded route. Allows if `req.session.roles` intersects the requested set.
- `apps/api/src/auth/middleware.ts:requireManagerOf(req, targetUserId)` — used by team-scoped routes; admin OR has a `ManagerReport` link.
- `apps/api/src/routes/v1/managerReports.ts:GET /` — admin sees all; non-admin sees only links where they're the manager.
- `apps/web/src/lib/auth.ts:hasRole()` — every sidebar item + page guard.
- `apps/web/src/app/AppShell.tsx` — renders "My Team" link only for Manager/Admin; "Admin" + "Settings" sections only for Admin.
- `apps/web/src/app/guards.tsx:RequireRole` — page-level forbidden screen.

**Invariants:**
- A user MUST have at least one role. UI enforces this in `AdminUsers.tsx` (the role-chip toggle refuses to clear the last role). Backend `UpdateUserRolesInput` requires `roles.min(1)`.
- Roles are an unordered set, not a hierarchy. A Manager who needs Help Desk access gets BOTH roles assigned; we don't auto-grant Help Desk via Manager.
- `ManagerReport.source` precedence: `manual > entra > ad`. When directory sync (Phase 3) lands, it must NOT clobber manual rows.
- `requireManagerOf` returns `true` for Admins regardless of the link table — Admins can act on anyone.

**When changing this:**
- New role: add to the `Role` Prisma enum, mirror in `@celphei/shared/enums.ts` (`Role` const + `ALL_ROLES`), add to the sidebar conditional in `AppShell.tsx`, decide which existing routes should accept the new role.
- If you change the multi-role transaction shape in `PATCH /:id/roles`, verify both deletes and creates remain inside the same `$transaction` — losing atomicity would briefly leave a user with no roles.

---

## cross-cutting/event-emission

**What it is:** Activity log + real-time stream. Every meaningful action calls `emitEvent({...})`.

**Writers:**
- `apps/api/src/events/bus.ts:emitEvent()` — only writer. Persists an `Event` row and fires the in-process EventEmitter.
- Called from: `services/tickets.ts` (create + status change), `services/tasks.ts` (create + status change + delete), `routes/v1/auth.ts` (login success, login failure, logout), `routes/v1/tickets.ts` (delete, comment, link asset).

**Readers:**
- `apps/api/src/routes/v1/events.ts:GET /` — admin-only paginated list with severity/source/actor/time-range/q filters.
- `apps/api/src/routes/v1/events.ts:GET /stream` — admin-only SSE; subscribes to the bus and pushes `event: event\ndata: ...` frames; sends `: ping\n\n` heartbeats every 25s.
- `apps/web/src/features/events/EventsPage.tsx` — admin Events page. Live toggle subscribes via `new EventSource('/api/v1/events/stream', { withCredentials: true })`; off-toggle reverts to 5s polling of GET `/`.

**Invariants:**
- `emitEvent` is fire-and-forget. Errors are logged but never thrown — event writes must NEVER fail a business operation.
- `Event.source` is a free-form string but should match the enum in `@celphei/shared/enums.ts` (`auth | ticket | task | approval | polaris-sync | entra-sync | ldap-sync | system`). New sources go in that enum first.
- `Event.severity` is `info | warn | error`. Default is `info`.
- `subject` is the human-readable identifier (`INC-1234`, `TSK-42`) — used for filters and the Events table.
- Events are admin-visible only (Phase 1). Phase 2 will introduce per-permission filtering so ticket/task events flow to anyone who can read the underlying ticket.
- SSE handler cleans up listeners on `close` AND `aborted` — both are needed; browsers don't fire `close` on tab discard.

**When changing this:**
- If you add a new event source, mirror it in `@celphei/shared/enums.ts:EventSource` and add it to the source dropdown in `EventsPage.tsx`.
- Don't push large payloads into `Event.data` — `Event` rows accumulate and indexing JSONB on the hot path is expensive. Store the minimum needed for the activity log; details belong in `TicketHistory` or domain tables.
- If you call `emitEvent` from inside a Prisma `$transaction`, be aware that the event WILL be persisted even if the transaction rolls back — `emitEvent` opens its own connection. Either move the call outside the transaction OR accept the inconsistency.

---

## cross-cutting/polaris-asset-reference

**What it is:** Snapshot reference from a Celphei ticket to a Polaris asset. Stored as `PolarisAssetRef { ticketId, polarisAssetId, cachedName, cachedType, lastSyncedAt }`.

**Writers:**
- `apps/api/src/routes/v1/tickets.ts:POST /:id/assets` — upsert one ref. Updates `cachedName + cachedType + lastSyncedAt` on existing.
- `apps/api/src/services/tickets.ts:createTicket()` — `createMany` on initial ticket create when `assetIds` is provided. Stores ID only; no name cache initially.
- `apps/api/src/services/tickets.ts:updateTicket()` — when `assetIds` is provided, `deleteMany` then `createMany` (full replacement).

**Readers:**
- `apps/api/src/services/tickets.ts:toTicketDTO()` — includes `assets[]` in every ticket response.
- `apps/api/src/integrations/polaris.ts:PolarisAssetClient` — `searchAssets()` and `getAsset()` are read paths. Backed by 5-min in-process LRU; intended to be paired with the `PolarisAssetRef` snapshot for stale-tolerant rendering.
- `apps/web/src/features/tickets/TicketDetail.tsx` — renders the linked assets from the snapshot ONLY. Doesn't block on Polaris's availability.

**Invariants:**
- `(ticketId, polarisAssetId)` is unique. Linking the same asset twice to the same ticket is idempotent.
- The cache fields (`cachedName`, `cachedType`) are display-only — never join on them, never assume they're current. They exist so the ticket renders when Polaris is offline.
- `lastSyncedAt` is updated on every upsert. Phase 4 will add a background refresher; Phase 1 only refreshes on user-initiated link/relink.
- Cross-DB joins are forbidden. Polaris has its own Postgres; Celphei has its own Postgres. Asset data flows through `PolarisAssetClient` via REST only.
- Polaris credentials precedence: env (`POLARIS_BASE_URL` + `POLARIS_API_TOKEN`) > DB (`IntegrationConnection.kind = "polaris"`).

**When changing this:**
- New cached fields go on `PolarisAssetRef`, not in a side table — single source for asset snapshots.
- If you add a method to `PolarisAssetClient`, give it a cache entry (5-min TTL) and a graceful failure mode (return `null` on transport errors, log a warning, do NOT throw — the ticket render must not depend on Polaris being healthy).
- Integration-connection secret storage is currently the stub `{ _encryption: "none", payload: ... }`. Phase 3 lands real AES-256-GCM encryption using `ENCRYPTION_KEY`. Anything that reads `IntegrationConnection.config` MUST go through a helper (TBD: `services/integrationConfig.ts`) once Phase 3 ships — don't read `config.payload` directly outside of `polaris.ts`.

---

## cross-cutting/approval-lifecycle

**What it is:** Rule-based approval engine + the `ApprovalRequest` state machine that drives ticket-close gating.

**Writers** (places that mutate or emit this state):
- `apps/api/src/approvals/lifecycle.ts:reconcileApprovalsForTicket()` — only place that creates/cancels `ApprovalRequest` rows. Called from inside the ticket create/update Prisma transaction.
- `apps/api/src/approvals/lifecycle.ts:recordDecision()` — only place that inserts `ApprovalDecision` rows and transitions `ApprovalRequest.state` to `Approved`/`Rejected`.
- `apps/api/src/services/tickets.ts:createTicket()` — calls `reconcileApprovalsForTicket` once after the new ticket row is created.
- `apps/api/src/services/tickets.ts:updateTicket()` — calls `reconcileApprovalsForTicket` whenever any rule-input field changes (`priority`, `status`, `assigneeId`, `teamId`, `customFields`).
- `apps/api/src/routes/v1/tickets.ts:POST /:id/approvals/:requestId/decisions` — entry point for decisions; calls `recordDecision` inside a `$transaction` after `isEligibleApprover` check.
- `apps/api/src/routes/v1/approvalRules.ts` — admin CRUD for `ApprovalRule` rows (does NOT touch ApprovalRequest rows — see invariant below).

**Readers:**
- `apps/api/src/services/tickets.ts:updateTicket()` — close gate reads `ApprovalRequest.state` and refuses closure when any non-cancelled request is `Pending` or `Rejected`.
- `apps/api/src/routes/v1/tickets.ts:GET /:id/approvals` — serializes requests + decisions + summary for the `ApprovalsPanel`.
- `apps/api/src/approvals/lifecycle.ts:isEligibleApprover()` — checks roles + group membership against the rule's `approverGroupId`/`approverRole`.
- `apps/web/src/features/tickets/ApprovalsPanel.tsx` — renders per-request state chip + decisions; surfaces Approve/Reject buttons.

**Invariants:**
- `ApprovalRule` edits do NOT auto re-evaluate existing tickets. `ApprovalRequest.ruleId` is a foreign key — the originally-matched rule is preserved. Rule edits affect future evaluations only. (Phase 3 will add an explicit "re-evaluate open tickets" action.)
- Diff semantics on reconcile: new match → create Pending; still matched → leave alone (preserves in-flight decisions); no-longer-matched + Pending → cancel; no-longer-matched + Approved/Rejected → keep as history. Never delete a row that has decisions attached.
- One decision per `(requestId, approverId)`. Enforced in `recordDecision` via the decisions-list check before insert; database does NOT have the unique constraint (decisions are append-only audit), so the application MUST be the single writer.
- A request transitions to `Rejected` on the FIRST `Reject` decision regardless of `requiredCount`. `Approved` requires `approvals >= requiredCount`. No "majority" semantics — every reject is a hard veto.
- Empty rule (no group + no role) means "any authenticated user may decide". Admins ALWAYS pass `isEligibleApprover`.

**When changing this:**
- New operator on the rule engine: add to `RULE_LEAF_OPS` in `@celphei/shared/schemas/approval.ts`, add a `case` in `evalLeaf` in `expression.ts`, add tests to `expression.test.ts`, expose the op in `ExpressionEditor.tsx`.
- New field path (`assignee.email`, etc.): add a `readField` branch in `expression.ts` AND surface it in the `FIELDS` list in `ExpressionEditor.tsx`. The two MUST stay in sync — admins picking a field the engine doesn't know returns `undefined` (silently false).
- If you change the diff semantics in `reconcileApprovalsForTicket`, you'll likely break the "preserves in-flight decisions" invariant. Add a regression test before merging.
- If you add a new rule-input field to `Ticket`, extend the `if (changes.X)` guard in `updateTicket` so reconcile runs when it changes.

---

## cross-cutting/task-blocks-close

**What it is:** Ticket-close gate driven by `TicketType.tasksBlockClose` + open task count.

**Writers:**
- `apps/api/src/services/tickets.ts:updateTicket()` — only enforcer. Throws `conflict(...)` when `input.status === "Closed"` AND `type.tasksBlockClose === true` AND any task is not `Done`/`Cancelled`.
- `apps/api/src/seed/builtInTypes.ts` — seeds defaults: `Incident=false`, `Change=true`, `Request=false`.
- `apps/api/src/routes/v1/ticketTypes.ts:PATCH /:slug` — admin can toggle the flag per type.

**Readers:**
- `apps/api/src/services/tickets.ts:updateTicket()` — pulls `type` + `tasks` on the existing ticket, evaluates the gate.
- `apps/web/src/features/tickets/TicketDetail.tsx` — error message surfaces in the status-changer UI when the mutation throws.

**Invariants:**
- The gate is one-directional: closing is blocked. Re-opening a closed ticket with open tasks is allowed.
- `Cancelled` counts as a terminal task state — it does NOT block close.
- The check reads `existing.tasks` (which is `{ status }` only, queried inline). Don't paginate this — every ticket having too many tasks to fit in one query is a separate problem (Phase 4 may add a task-count materialized column).
- The flag is per-type. Admin tickets-types editor (Phase 2) is the canonical place to toggle it; the Phase 1 admin patch route exists as an escape hatch.

**When changing this:**
- If a new task status is added that's "complete-ish but not done" (e.g. `Blocked`), decide whether it blocks close and update the filter in `updateTicket()`.
- The seeded defaults are operator-overridable on first run — don't change them silently in `seedBuiltInTypes()` without a migration path for existing installs (`upsert` only updates `name + isBuiltIn`).
- The close gate composes with `cross-cutting/approval-lifecycle` — both are independent reasons to refuse closure. Don't merge the checks into one; the error messages differ and users need both signals.

---

# Per-service touches

## services/tickets

**What it owns:** Ticket lifecycle — create, update (with status transitions, asset re-linking, task-block-close gate), get, list with filters.

**Public API:** `createTicket`, `updateTicket`, `getTicket`, `getTicketByNumber`, `listTickets`, `toTicketDTO`.

**Cross-service deps:** `db/prisma`, `events/bus.emitEvent`, `middleware/errorHandler` (notFound/conflict/badRequest).

**Used by:**
- `routes/v1/tickets.ts` — all CRUD routes.
- `routes/v1/search.ts` — `listTickets` style filter (inlined directly via Prisma for the search fan-out).

**Invariants:**
- `ticketNumber` is `{type.prefix}-{seq}` where `seq` is sourced from `TicketType.nextNumber` incremented atomically inside the create transaction.
- Status transitions log to `TicketHistory` AND emit an `Event` (source=ticket). Updates that change nothing don't log.
- Closing sets `closedAt = now()`. Reopening (any non-Closed status when `closedAt` is set) clears it.
- `customFields` shape is owned by `TicketType.schema` — the service does not validate field-by-field (Phase 2 will, once the schema editor ships).
- `tasksBlockClose` gate: see [cross-cutting/task-blocks-close](#cross-cuttingtask-blocks-close).

**When changing this:**
- Status transition rules go here, not in routes — routes call `updateTicket` and let it enforce.
- If you add new ticket fields, update both the Prisma schema AND `@celphei/shared/schemas/ticket.ts` (DTOs + inputs). The shared package is the contract.
- The `toTicketDTO()` mapper is exported so search/list code paths produce the same shape — extend it, don't duplicate.

---

## services/tasks

**What it owns:** Task (sub-ticket) lifecycle — create, update (with `completedAt` invariant on Done transitions), delete. Generates `TSK-####` numbers.

**Public API:** `listTasksForTicket`, `createTask`, `updateTask`, `deleteTask`, `toTaskDTO`.

**Cross-service deps:** `db/prisma`, `events/bus.emitEvent`, `middleware/errorHandler`.

**Used by:**
- `routes/v1/tickets.ts:GET /:id/tasks, POST /:id/tasks` — list + create.
- `routes/v1/tasks.ts:GET/PATCH/DELETE /:id` — individual task operations.
- `routes/v1/search.ts` — task fan-out (inline Prisma).

**Invariants:**
- `taskNumber` uses a single global sequence (`TSK-N`). Generated inside the create transaction via `nextTaskNumber(tx)` which does a `findFirst({ orderBy: createdAt desc })`. This is racy under high concurrency — Phase 4 will replace with a Postgres sequence if it bites.
- `completedAt` is set on `status → Done` and cleared on `status → !Done` (including `Cancelled`).
- Deleting a task does NOT cascade to parent ticket history. The `Event` row is the audit trail.
- Tasks block parent close per [cross-cutting/task-blocks-close](#cross-cuttingtask-blocks-close).

**When changing this:**
- New task statuses: add to Prisma enum + `@celphei/shared/enums.ts:TaskStatus` + update the `tasksBlockClose` filter in `services/tickets.updateTicket`.
- The `nextTaskNumber` helper is fine for Phase 1 traffic levels; if you observe `Unique constraint` errors on `taskNumber`, swap to a Postgres sequence.

---

## services/auth (sessions + providers + passwords)

**What it owns:** Local-account authentication, session creation/lookup/destroy, password hashing/verification, enabled-provider listing.

**Public API:**
- `auth/sessions.ts`: `createSession`, `loadSession`, `destroySession`, `csrfTokensMatch`, `SESSION_COOKIE`.
- `auth/passwords.ts`: `hashPassword`, `verifyPassword`.
- `auth/providers.ts`: `authenticateLocal`, `listEnabledProviders`.
- `auth/middleware.ts`: `sessionResolver`, `csrfGuard`, `requireAuth`, `requireRole`, `requireManagerOf`.

**Cross-service deps:** `db/prisma`, `middleware/errorHandler` (unauthorized/forbidden), `argon2`.

**Used by:**
- `routes/v1/auth.ts` — login/logout/me/providers/csrf.
- `app.ts` — `sessionResolver + csrfGuard` mounted globally.
- Every authenticated route via `requireAuth` / `requireRole`.

**Invariants:**
- Argon2id parameters use library defaults — DON'T downgrade. If we change them, we MUST keep verifying old hashes correctly (Argon2id embeds parameters in the hash string, so this is automatic).
- `req.session` exposed via `declare global { namespace Express { interface Request { session?: SessionContext } } }` in `middleware.ts`. Do not re-augment in route files.
- API-token requests fabricate a `SessionContext` with `csrfSecret: ""` so downstream code can treat session and token paths uniformly — `csrfGuard` early-returns on `req.apiToken` so the empty secret is never checked.
- See [cross-cutting/session-and-csrf](#cross-cuttingsession-and-csrf) for the full session/CSRF contract.

**When changing this:**
- Adding a new auth provider type (Phase 3 — SAML/OIDC/LDAP/Polaris): implement an `authenticate` function in `auth/providers.ts`, add it to the `AuthProviderType` enum (Prisma + `@celphei/shared`), and extend `listEnabledProviders` to surface it on the login screen.
- Don't bypass `sessionResolver` — every request goes through it. Routes that should accept unauthenticated traffic just don't add `requireAuth`.

---

## services/search

**What it owns:** Universal `/api/v1/search?q=&scope=` fan-out across tickets, tasks, users, and Polaris assets.

**Public API:** Inlined in `routes/v1/search.ts:GET /` (no dedicated service module yet — extract when it grows past one screen).

**Cross-service deps:** `db/prisma`, `integrations/polaris.searchAssets`.

**Used by:**
- `apps/web/src/features/search/CommandPalette.tsx` — ⌘K palette.

**Invariants:**
- Returns a flat `hits[]` discriminated by `kind: "ticket" | "task" | "user" | "asset"`. The DTO lives in `@celphei/shared/schemas/search.ts`.
- Per-kind limit is 8 hits (`limit` const in route file). Total result count per kind is in `groupCounts`.
- `kind: "asset"` hits open in a new tab (Polaris); other kinds open via React Router navigation.
- All fan-outs run in parallel (`Promise.all`) — slow Polaris doesn't block tickets/tasks/users.
- Authentication required (`requireAuth`). No per-row filtering yet — every authenticated user sees every result. Phase 2 will add visibility filters once ticket access control beyond "any authenticated user" is needed.

**When changing this:**
- New kind: add to `SearchHitDTO` discriminated union in `@celphei/shared/schemas/search.ts`, add a parallel branch + `out.push({...})` in the route handler, add a `KindBadge` mapping in `CommandPalette.tsx`.
- If you change the URL shape returned in `hit.url`, update the navigation code in `CommandPalette.tsx` — the palette dispatches by `hit.kind`.

---

## services/events

**What it owns:** Persistent activity log + in-process SSE pub/sub.

**Public API:** `events/bus.ts`: `emitEvent`, `eventBus`. Routes: `routes/v1/events.ts` GET / and GET /stream.

**Cross-service deps:** `db/prisma`, `observability/logger`.

**Used by:** Every service that emits events (tickets, tasks, auth, ticket comment/asset routes). SSE consumed by `apps/web/src/features/events/EventsPage.tsx`.

**Invariants:**
- See [cross-cutting/event-emission](#cross-cuttingevent-emission).

**When changing this:**
- The SSE stream is admin-only via `requireRole("Admin")`. Phase 2 will introduce per-ticket-visibility filtering — the broadcaster will need to filter events per subscriber.
- `eventBus.setMaxListeners(100)` is the only limit; one listener per open Events tab. If you expose SSE to all roles in Phase 2, raise this AND add backpressure.

---

## services/polaris (integrations)

**What it owns:** Polaris REST client. Resolves credentials from env-vars-first then DB; exposes `searchAssets(q, limit)` and `getAsset(id)`.

**Public API:** `integrations/polaris.ts`: `searchAssets`, `getAsset`, `clearPolarisCache`.

**Cross-service deps:** `config/env`, `db/prisma`.

**Used by:**
- `routes/v1/polaris.ts` — `/api/v1/polaris/assets/{search,:id}` proxy routes.
- `routes/v1/search.ts` — universal-search asset fan-out.
- Phase 4 will add a background refresher for `PolarisAssetRef`.

**Invariants:**
- See [cross-cutting/polaris-asset-reference](#cross-cuttingpolaris-asset-reference).
- Credential precedence: env > DB.
- Cache TTL 5 minutes, in-process LRU. Process restart clears the cache.
- Transport errors return `null` and log a warning — they do NOT throw. The ticket render must never fail because Polaris is unavailable.

**When changing this:**
- Adding a new Polaris endpoint: same cache + null-on-failure pattern.
- DO NOT add a build-time dependency on Polaris's TypeScript types. The wire shape is our concern; we model it minimally and tolerate extras.

---

## services/integrations/setup (wizard)

**What it owns:** First-run wizard — bootstrap-mode Express app, test endpoints, atomic finalize.

**Public API:** `setup/setupServer.ts:startSetupServer`, `setup/setupRoutes.ts:buildSetupRouter`, `setup/detectSetup.ts:getSetupState`.

**Cross-service deps:** `config/env`, `db/prisma` (LAZY — only inside `finalizeSetup` after migrations run), `observability/logger`, `utils/paths`, `auth/passwords.hashPassword`, `seed/builtInTypes.seedBuiltInTicketTypes`.

**Used by:**
- `index.ts:main()` — branches into `startSetupServer()` when state is `needs-setup`.
- `apps/api/public/setup.html` + `public/js/setup.js` — the wizard UI.

**Invariants:**
- The setup server boots WITHOUT a Prisma client (and without a DB). Loading `db/prisma` at module level would fail when `DATABASE_URL` is unset.
- `finalizeSetup` is the only place that creates the DB, runs migrations, and writes the marker. Steps in order: create DB → write `state/.env` → set `process.env` → run `prisma migrate deploy` → Prisma transaction (admin user + Setting + IntegrationConnection rows) → seed built-in types → write marker → `process.exit(0)`.
- Test endpoints (`/test-connection`, `/test-polaris`, `/test-directory`, `/test-smtp`) MUST NOT write anything. They're idempotent and side-effect-free.
- The wizard's frontend is intentionally vanilla JS — it runs without the React bundle (which can't be served until normal mode boots).

**When changing this:**
- New wizard step: add the step UI to `setup.html`, add a `data-step="N"` panel + stepper entry in `setup.js`, add an optional payload field to `FinalizeSetupInput` in `@celphei/shared/schemas/setup.ts`, add an inline write inside the `finalizeSetup` Prisma transaction.
- Test endpoints: add `/api/setup/test-<name>` in `setupRoutes.ts`. Wire the button via `data-action="test-<name>"` in `setup.js`.
- If you need to ship a config-file migration (changing the marker format, env file shape, etc.), add a versioning header to the marker. See Polaris's `SHELOB1\0`/`POLARIS\0` lesson — the cost of forgetting is operator-visible.

---

## services/seed/built-in-types

**What it owns:** Idempotent upsert of the built-in `Incident`, `Change`, `Request` ticket types.

**Public API:** `seed/builtInTypes.ts:seedBuiltInTicketTypes(prisma)`.

**Cross-service deps:** `@prisma/client` types only.

**Used by:**
- `prisma/seed.ts` — `pnpm db:seed` entry point.
- `setup/setupRoutes.ts:finalizeSetup()` — called after migrations + admin user create.

**Invariants:**
- `upsert` by `slug`. `update` only writes `name + isBuiltIn` — operator customizations to `prefix`, `schema`, `tasksBlockClose`, `workflowConfig` survive re-seeds.
- Default `tasksBlockClose`: `Incident=false`, `Change=true`, `Request=false`.
- `isBuiltIn=true` is locked on (not operator-toggleable). Built-in types can be deactivated (`isActive=false`) but not deleted in Phase 1.

**When changing this:**
- Adding a new built-in type: append to the `types` array. The Prisma `upsert` is idempotent so re-running is safe.
- Changing the default `schema` for an existing built-in: existing installs WILL keep their schema (upsert update doesn't touch it). To roll out a schema change, ship a migration or admin UI tooling.

---

## approvals/expression (Phase 2)

**What it owns:** Pure rule expression evaluator. Operators, ordered vocabularies, leaf/combinator/not semantics.

**Public API:** `apps/api/src/approvals/expression.ts`: `evaluate(expr, ticket)`, `type EvalTicket`. Tests in `expression.test.ts` (14).

**Cross-service deps:** None (intentional — this is a pure module with no DB or framework imports).

**Used by:**
- `apps/api/src/approvals/lifecycle.ts:evaluateRulesForTicket()` — the sole production caller.
- `apps/api/src/approvals/expression.test.ts` — unit tests.

**Invariants:**
- Pure: no DB, no I/O, no async. Synchronous return.
- Total: any unknown operator or unknown field path returns `false` rather than throwing. Admins can't crash ticket ops by saving a malformed rule.
- Ordered vocabularies in `ORDERED_VOCABULARIES` define `lt/lte/gt/gte` order for non-numeric strings. Currently: `["low","medium","high","critical"]`, `["p4","p3","p2","p1"]` (P1 = highest severity), `["info","warn","error"]`.
- Numeric coercion: when both sides of a comparison parse as finite numbers, numeric compare wins over vocab/lexicographic.

**When changing this:**
- New operator: add to the `RULE_LEAF_OPS` constant in `@celphei/shared/schemas/approval.ts`, add a case in `evalLeaf`, add at least one test per branch. The `ExpressionEditor.tsx` dropdown reads from the shared constant — no client-side wire-up needed.
- New ordered vocabulary: append to `ORDERED_VOCABULARIES`. All entries lowercase, ordered low → high. Tests should pin the boundary cases.
- DON'T add async or DB lookups here. Field resolution stays string-only; if you need to fan out to "is requester a member of this group", do it in `lifecycle.ts` or `isEligibleApprover`.

---

## approvals/lifecycle (Phase 2)

**What it owns:** `ApprovalRequest` diff reconciliation + `ApprovalDecision` recording + per-ticket summary + eligibility check.

**Public API:** `evaluateRulesForTicket`, `reconcileApprovalsForTicket`, `recordDecision`, `getTicketApprovalSummary`, `isEligibleApprover`.

**Cross-service deps:** `db/prisma`, `events/bus.emitEvent`, `approvals/expression.evaluate`.

**Used by:**
- `services/tickets.ts:createTicket()` + `updateTicket()` — call `reconcileApprovalsForTicket` inside the same Prisma transaction as the ticket write.
- `services/tickets.ts:updateTicket()` close gate — reads `ApprovalRequest.state`.
- `routes/v1/tickets.ts:POST /:id/approvals/:requestId/decisions` — calls `recordDecision` (+ `isEligibleApprover` first).
- `routes/v1/tickets.ts:GET /:id/approvals` — calls `getTicketApprovalSummary`.

**Invariants:**
- See [cross-cutting/approval-lifecycle](#cross-cuttingapproval-lifecycle).
- `reconcileApprovalsForTicket` MUST be called with the Prisma `tx` argument from a containing transaction — otherwise we lose the "ticket + approvals atomic" invariant.
- `recordDecision` throws an error with `code: "already_decided"` if the approver already decided on the request; routes translate to 409.

**When changing this:**
- New request states beyond `Pending/Approved/Rejected/Cancelled`: update the Prisma enum, the shared `ApprovalState` constant, every branch in `recordDecision`, and the close gate in `services/tickets.updateTicket`.
- If you change `getTicketApprovalSummary`'s notion of "approved" (currently: `total > 0 && approvedCount === total`), audit ALL downstream readers. The route returns this verbatim to the client.

---

## services/server-settings (Phase 2 — Time/NTP + Certificates + Maintenances)

**What it owns:** The three Phase 2 Settings tabs: time/NTP config, certificate info (read-only), and maintenance windows.

**Public API:** Inlined in `apps/api/src/routes/v1/settings.ts` (no dedicated service module; routes hit Prisma directly — extract if business logic grows).

**Cross-service deps:** `db/prisma`, `config/env` (for the Certificates tab's `TRUST_PROXY` read).

**Used by:**
- `apps/web/src/features/settings/TimeNtp.tsx` — GET `/time-ntp` (10s polling for server-clock display), PATCH `/time-ntp` (timezone), POST/DELETE `/time-ntp/servers/:id` (NtpServer CRUD).
- `apps/web/src/features/settings/Certificates.tsx` — GET `/certificates` (read-only).
- `apps/web/src/features/settings/Maintenances.tsx` — full CRUD on `/maintenances`.

**Invariants:**
- `NtpServer.host` is unique. Upsert by host on POST (so admins can update an existing server's priority by re-submitting).
- NTP servers are CONSULTATIVE — Celphei does NOT control the host OS clock. The stored list is for audit and a future ntp-status job (Phase 3).
- `Maintenance` validation: `endsAt > startsAt`. Enforced via zod `.refine()` on both create and update (the update refine handles the partial-update case where only one of startsAt/endsAt is provided).
- Certificates tab is intentionally read-only. Cert management lives at the reverse proxy. The route reads `env.TRUST_PROXY` and emits operator-facing notes.

**When changing this:**
- If you add cert upload (Phase 3+): introduce a `Certificate` Prisma model, a service module that holds the storage layer (filesystem? S3?), and a service-level uniqueness/validity check. Don't push that logic into the route file.
- New maintenance severity beyond `info|warn|error`: update the zod enum in `@celphei/shared/schemas/serverSettings.ts`, the Prisma column default, the `SeverityChip` in `Maintenances.tsx`.

---

## services/approval-rules + services/groups (Phase 2)

**What they own:** Admin CRUD for `ApprovalRule` rows and `Group` rows. Thin route layers over Prisma.

**Public API:** `routes/v1/approvalRules.ts` (`approvalRulesRouter`) and `routes/v1/groups.ts` (`groupsRouter`).

**Cross-service deps:** `db/prisma`.

**Used by:**
- `apps/web/src/features/admin/approvalRules/AdminApprovalRules.tsx` — list, create, update, delete; uses `/api/v1/ticket-types` to scope rules per type and `/api/v1/groups` for the approver picker.
- `apps/web/src/features/admin/AdminGroups.tsx` — CRUD + member management.
- `apps/api/src/approvals/lifecycle.ts:evaluateRulesForTicket()` reads `ApprovalRule` rows in production; it is INDEPENDENT of these admin routes (engine doesn't mutate rules).

**Invariants:**
- `ApprovalRule.ticketTypeId` is immutable in the UI (the modal editor doesn't expose changing it). To "move" a rule to another type, admins delete + recreate. Keeping the FK stable means historical `ApprovalRequest.ruleId` references stay consistent.
- `GroupMember` PK is `(groupId, userId)` — duplicates are impossible. The route uses `upsert` so re-adding is idempotent.
- Deleting a `Group` cascades to `GroupMember` rows but NOT to `ApprovalRule.approverGroupId` (set null via `onDelete: SetNull` in the schema). Pending approvals against that rule continue to exist; the rule's group simply becomes "any authenticated user" until an admin fixes it.

**When changing this:**
- New approver targeting (e.g., assignee's manager): add a column on `ApprovalRule`, extend `isEligibleApprover` in `lifecycle.ts`, extend the `ApprovalRuleEditor` form.
- Bulk reassignment of pending requests when a rule changes: deliberately not implemented (see invariant in cross-cutting/approval-lifecycle). If you build it, it goes in a new service module — not in the routes — and emits one `Event` per affected request.
