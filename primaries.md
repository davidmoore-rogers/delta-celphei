# Delta Celphei — Primaries Index

A lookup index of **canonical implementations** to model new work after. Answers the question **"there's already a pattern for this — which one should I copy?"**

This file complements [CLAUDE.md](CLAUDE.md) (narrative architecture) and [touches.md](touches.md) (cross-cutting writers/readers/invariants). Use `primaries.md` whenever you're about to build a new instance of a pattern that already exists somewhere — pick the canonical one and copy its shape.

## How to use

1. Find the pattern that matches what you're building (REST resource, service, dynamic form, page layout, …).
2. Open the **Canonical implementation** file/line and read it.
3. Match its conventions — DOM/data shape, helper calls, validation pattern, error handling.
4. Only diverge when the new surface genuinely needs something the canonical doesn't (note the divergence in your PR).
5. **Keep this file current.** Per CLAUDE.md's commit-review rule, every commit re-reads `primaries.md` for staleness — if your change replaced the canonical, moved its file, or invalidated a convention, fix it in the same commit.

## Format

Per-pattern sections:
- **What it is** — one-sentence scope
- **Canonical implementation** — entry-point function + file path
- **Key conventions** — DOM/data shape, helpers, validation, error handling
- **When adding a new instance** — checklist before merging

## Sections

- [REST resource route file](#rest-resource-route-file)
- [Service-layer module](#service-layer-module)
- [Zod schema in @celphei/shared](#zod-schema-in-celpheishared)
- [SPA page route + auth gate](#spa-page-route--auth-gate)
- [TanStack Query data-fetching component](#tanstack-query-data-fetching-component)
- [Dynamic form (custom-field driven)](#dynamic-form-custom-field-driven)
- [Tabbed settings sub-page](#tabbed-settings-sub-page)
- [SSE live-stream consumer](#sse-live-stream-consumer)
- [Setup wizard step](#setup-wizard-step)
- [Vanilla-JS wizard navigation](#vanilla-js-wizard-navigation)
- [Admin-only multi-role guard](#admin-only-multi-role-guard)

---

## REST resource route file

**What it is:** An Express `Router` file under `apps/api/src/routes/v1/` that exposes CRUD for one resource (or a thin sub-resource family).

**Canonical implementation:** [`apps/api/src/routes/v1/tickets.ts`](apps/api/src/routes/v1/tickets.ts).

**Key conventions:**
- Import the named zod schemas from `@celphei/shared` (e.g., `CreateTicketInput`, `ListTicketsQuery`) — never inline a schema in the route.
- `ticketsRouter.use(requireAuth)` is a single line at the top — protects every route in the file. Use `requireRole("Admin", ...)` on individual routes for finer scope.
- Every handler is `async (req, res, next) => { try { ... } catch (err) { next(err) } }`. Don't write a per-handler error response — `middleware/errorHandler.ts` does the translation.
- Validate input via `Schema.parse(req.body)` (throws → caught → `ZodError` → 400 JSON envelope).
- Route params: `const id = req.params.id as string;` at the TOP of the handler. Don't sprinkle `as string` at usage sites.
- 201 on create, 204 on delete (no body), 200 + JSON on read/update.
- Service-layer calls do the work; route file is thin (auth check → parse → service call → respond). When a route grows past ~15 lines of business logic, extract to `services/<resource>.ts`.
- Use `services/<resource>.toXDTO()` mappers — never hand-build the JSON response shape inside the route.

**When adding a new instance:**
- Create `apps/api/src/routes/v1/<resource>.ts`. Export `<resource>Router`.
- Mount in `apps/api/src/app.ts` under `/api/v1/<plural-resource>`.
- Add the input + DTO schemas to `@celphei/shared/schemas/<resource>.ts` first; the API and the web both consume them.
- If you find yourself writing > ~50 lines of business logic in the route, extract a service.

---

## Service-layer module

**What it is:** A `apps/api/src/services/<name>.ts` module that holds business logic — Prisma queries + transactions + invariant enforcement + event emission. Routes call services; services are the canonical place to mutate domain state.

**Canonical implementation:** [`apps/api/src/services/tickets.ts`](apps/api/src/services/tickets.ts).

**Key conventions:**
- Export named functions (`createX`, `updateX`, `getX`, `listX`, `toXDTO`). No default exports.
- Pull Prisma via `getPrisma()` (NEVER `new PrismaClient()` directly — breaks the singleton).
- Use `Prisma.<X>UncheckedUpdateInput` when an update writes scalar FK columns (`assigneeId`, `teamId`). The strict `UpdateInput` shape forces `assignee: { connect: { id } }` — verbose for the common case.
- Wrap multi-write operations in `prisma.$transaction(async (tx) => { ... })`. Use the `tx` argument inside the callback, not the top-level `prisma`.
- Throw via `notFound("X")`, `conflict("...")`, `badRequest("...")` from `middleware/errorHandler.ts`. The route's `try/catch → next(err)` translates these to the JSON envelope.
- Emit events via `emitEvent({ source, severity?, actorId, subject, message, data? })` on state changes. Events are fire-and-forget — they MUST NOT fail a business operation.
- Write a single exported `toXDTO(row)` mapper. Every read path uses it; the shape lives in `@celphei/shared`.

**When adding a new instance:**
- Define the DTO + input schemas in `@celphei/shared/schemas/<resource>.ts` first.
- Define a row-shape type alias if you need a Prisma `GetPayload<...>` with includes (see `TicketWithRels` in `services/tickets.ts`).
- Keep the `toXDTO` mapper at the bottom of the file. Export it so routes that fetch with the same `include` shape can reuse.

---

## Zod schema in @celphei/shared

**What it is:** Runtime-validated, type-inferred schema shared between API and web. Source of truth for the wire contract.

**Canonical implementation:** [`packages/shared/src/schemas/ticket.ts`](packages/shared/src/schemas/ticket.ts).

**Key conventions:**
- One file per resource (`ticket.ts`, `task.ts`, `user.ts`, etc.).
- Pattern: export the `XDTO` schema first (the wire shape that goes back to the client), then `CreateXInput`, then `UpdateXInput` (often `CreateXInput.partial()`), then any `ListXQuery` (with `z.coerce.number()` for query-string ints).
- `export type X = z.infer<typeof X>` alongside every schema — TS-side consumers import the type, runtime consumers import the schema.
- Enums: source from `@celphei/shared/enums.ts` and use `z.enum(Object.values(MyEnum) as [string, ...string[]])`. Don't duplicate enum values inside zod schemas.
- Dates over the wire are ISO strings: `z.string().datetime()`. The mapper functions (`toXDTO`) call `.toISOString()` once.
- Nested DTOs use schema references, not inlined `z.object`s (so they're reusable). See `PolarisAssetRefDTO` referenced from `TicketDTO`.

**When adding a new instance:**
- Create `packages/shared/src/schemas/<name>.ts`.
- Re-export from `packages/shared/src/index.ts` (the barrel).
- The shared package has no build step — consumers (api + web) import `.ts` source directly. Both tsx (api dev) and Vite (web) handle this. Don't add a build step unless you have a forcing reason.

---

## SPA page route + auth gate

**What it is:** A React page mounted under `/...` in the SPA router, gated by authentication and (optionally) a role.

**Canonical implementation:** [`apps/web/src/app/routes.tsx`](apps/web/src/app/routes.tsx).

**Key conventions:**
- All authenticated pages mount as children of the `RequireAuth` route, which wraps the `AppShell` (header + sidebar + outlet).
- Role-gated pages wrap the element with `<RequireRole roles={[...]}>...</RequireRole>` from `apps/web/src/app/guards.tsx`. Returns an in-shell "you don't have permission" message; does NOT redirect.
- Top-level `RequireAuth` redirects unauthenticated users to `/login` with `state.from` set.
- Sub-routes that share a layout use the React Router `children` pattern with a layout component rendering `<Outlet/>`. The Settings tabs are the example.
- Default child route: redirect to a sensible first tab via `<Navigate to="customization" replace />`.

**When adding a new instance:**
- Add the route to `routes.tsx`. Decide: open to all roles, gated by role(s), or admin-only.
- If the page sits in the sidebar, add the entry in `AppShell.tsx`'s sidebar block (role-conditional rendering already wired).
- Create `features/<feature>/<Page>.tsx`. Default-export the component (Router data routers don't care; named export is fine too — be consistent within a feature folder).

---

## TanStack Query data-fetching component

**What it is:** A page or panel that reads server state via TanStack Query and mutates via `useMutation`.

**Canonical implementation:** [`apps/web/src/features/tickets/TicketList.tsx`](apps/web/src/features/tickets/TicketList.tsx) (reads) and [`apps/web/src/features/tickets/TicketDetail.tsx`](apps/web/src/features/tickets/TicketDetail.tsx) (reads + mutations).

**Key conventions:**
- Query key shape: `[<resource-plural>, <id>?, <subkind>?]` or `[<resource-plural>, { ...filters }]`. Example: `["ticket", id, "tasks"]`, `["tickets", { status, priority }]`.
- Mutations invalidate query keys via `queryClient.invalidateQueries({ queryKey: [...] })` in `onSuccess`. Be specific about which keys — invalidating too broadly causes spurious refetches.
- Fetch via the shared `api()` helper from `lib/api.ts`. It handles credentials, CSRF, JSON parsing, error envelope translation. Don't `fetch()` directly.
- Server state stays in TanStack Query. Local UI state (open modal, draft form values) stays in `useState`. App-wide ephemeral state (sidebar open, command palette open, theme) lives in Zustand (`stores/uiStore.ts`).
- Loading/error/empty states are explicit — see the `if (list.data?.items.length === 0)` pattern in `TicketList.tsx`.

**When adding a new instance:**
- Define the query key first. Then write the fetcher (`() => api<RespType>(...)`). Then write the component.
- Reuse the response types from `@celphei/shared` (`TicketDTO`, `TaskDTO`, etc.) — don't redefine them in the component.
- Mutations: write `onSuccess` to invalidate the specific keys affected. Don't `queryClient.invalidateQueries()` with no args.

---

## Dynamic form (custom-field driven)

**What it is:** A form that renders inputs from a runtime schema (e.g., `TicketType.schema.fields[]`).

**Canonical implementation:** [`apps/web/src/features/tickets/NewTicket.tsx#renderInput()`](apps/web/src/features/tickets/NewTicket.tsx).

**Key conventions:**
- One `renderInput(field, value, onChange)` function maps every supported `field.type` to its input. Currently: `text | textarea | number | select | date`. New types extend this function — don't fork per-type-of-form components.
- Field metadata shape lives in `@celphei/shared/schemas/ticket.ts:TicketTypeFieldSchema`. Adding a new field type means: extend the union in the schema, add a branch in `renderInput`, update the Prisma `TicketType.schema` JSONB shape.
- `customFields` is a plain `Record<string, unknown>` in component state; serialized as-is when submitted. Validation is server-side via `services/tickets.createTicket` (Phase 2 will add schema-driven validation).
- Required fields use `required={f.required}` on the input — native HTML validation. Phase 2 will replace with React Hook Form + zod for richer messages.
- Help text via `helpText` slot under the field label.

**When adding a new instance:**
- New field type: add to `TicketTypeFieldSchema.type` enum in `@celphei/shared/schemas/ticket.ts`, add a `if (f.type === "newkind") { return ... }` branch in `renderInput`.
- Field types that need a remote picker (e.g., `user`, `asset`): the asset picker is intended to use the existing `/api/v1/polaris/assets/search` endpoint; the user picker uses `/api/v1/users?q=...`. Build these as sibling components with the same `value`/`onChange` props so they slot into `renderInput` cleanly.

---

## Tabbed settings sub-page

**What it is:** A settings page with horizontal tabs that deep-link via URL.

**Canonical implementation:** [`apps/web/src/features/settings/SettingsLayout.tsx`](apps/web/src/features/settings/SettingsLayout.tsx) + sibling components in `features/settings/`.

**Key conventions:**
- Layout component renders the tab strip + `<Outlet/>`. Each tab is a child route under `/settings`.
- Tab links use `<NavLink to="<slug>">` with `isActive` styling. NavLink writes the active route to the URL — refresh and shareable links work.
- A redirect (`<Navigate to="customization" replace />`) handles the index route so `/settings` lands on the first tab.
- Tab content components (`Customization.tsx`, `ApiTokens.tsx`, `ComingSoon.tsx`) live as siblings in the same folder.
- Phase 2 tabs (`Time/NTP`, `Certificates`, `Maintenances`) use the `ComingSoon` placeholder until the underlying services land. The route is wired NOW so the tab strip is complete in Phase 1.

**When adding a new instance:**
- Add a `{ to: "<slug>", label: "..." }` entry to `TABS` in `SettingsLayout.tsx`.
- Add a child route in `apps/web/src/app/routes.tsx` under the `settings` parent.
- Add a sibling component file.
- The whole `/settings/*` tree is wrapped in `<RequireRole roles={["Admin"]}>` — don't add a non-admin tab without splitting the guard scope.

---

## SSE live-stream consumer

**What it is:** A React component that subscribes to `text/event-stream` from the API and renders live updates.

**Canonical implementation:** [`apps/web/src/features/events/EventsPage.tsx`](apps/web/src/features/events/EventsPage.tsx).

**Key conventions:**
- Use the native `EventSource` constructor with `{ withCredentials: true }` (sends the session cookie).
- Track the connection in a `useRef` so the cleanup function in `useEffect` can `.close()` it.
- Add a listener per named event type via `es.addEventListener("event", ...)`. Don't rely on the default `message` event — the server emits `event: event\ndata: ...`.
- Cap retained items in component state (e.g., `slice(0, 500)`) — SSE can stream indefinitely.
- Provide a toggle to switch between live SSE and polled GET — the server may not always be reachable on a CDN-fronted deployment.
- The cleanup function closes the EventSource AND nulls the ref. Don't depend on browser GC.

**When adding a new instance:**
- Backend: in the API route, set headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`), call `res.flushHeaders()`, push frames via `res.write("event: <name>\ndata: <json>\n\n")`. Heartbeat every 25s with `: ping\n\n`.
- Both `close` AND `aborted` events on `req` must trigger cleanup — some browsers don't fire `close` on tab discard.

---

## Setup wizard step

**What it is:** A single step in the first-run wizard with its own HTML panel, validation rules, and (optionally) a test button.

**Canonical implementation:** [`apps/api/public/setup.html`](apps/api/public/setup.html) step panels + corresponding logic in [`apps/api/public/js/setup.js`](apps/api/public/js/setup.js).

**Key conventions:**
- Each step is a `<section class="step-panel" data-step="<N>">` with consistent inner structure: `<h2>` title (optional `<span class="step-optional">` for skippable steps), `<p class="step-desc">` description, form fields, optional `<div class="actions">` for test buttons, optional `<div class="test-result" data-test-result="<key>">`.
- Forms use plain HTML inputs with `name="<step>.<field>"` (e.g., `name="db.host"`). The `val(name)` and `checked(name)` helpers read by name.
- Test buttons set `data-action="test-<thing>"` and are wired centrally in `bindActions()`. The handler POSTs to `/api/setup/test-<thing>` and surfaces the result via `showTestResult(<key>, message, "success" | "error")`.
- Step advancement passes through `canAdvance(step)` — return `true` when all required validation holds for that step. Skippable steps (4–7 in the current wizard) get `SKIPPABLE_STEPS` membership in `setup.js` (Skip button visible).
- Field edits on tested steps reset the test state — see the `db.*` listeners in `bindLiveValidation()` that flip `state.connectionTested = false` on input.
- The whole submission payload is shaped by `collectFinalPayload()` which assembles only the populated optional sections.

**When adding a new instance:**
- Add the `<section data-step="<N>">` to `setup.html`.
- Add the step label to `STEP_LABELS` in `setup.js` (used to render the stepper).
- Update `TOTAL_STEPS` and `SKIPPABLE_STEPS` if applicable.
- Add a `canAdvance(<N>)` branch validating the step's required fields.
- Add the per-step state collection to `collectFinalPayload()`.
- Add the optional field group to `FinalizeSetupInput` in `@celphei/shared/schemas/setup.ts`.
- Add the persistence logic inside `finalizeSetup()` in `apps/api/src/setup/setupRoutes.ts` (inside the Prisma transaction if it writes to the DB).

---

## Vanilla-JS wizard navigation

**What it is:** Step navigation pattern for the wizard — in-memory state, no URL routing, panel toggle via class.

**Canonical implementation:** [`apps/api/public/js/setup.js`](apps/api/public/js/setup.js) — `state.currentStep`, `showStep(n)`, `updateStepper(idx)`.

**Key conventions:**
- One JS module-scope `state` object holds `currentStep` + per-step transient flags (`connectionTested`, `directoryTab`).
- `showStep(step)` toggles `.step-panel.visible` and `.hidden` per element. **No URL routing** — the wizard is intentionally a single-page experience; refreshing returns to step 1 (the wizard's atomic finalize means there's nothing to resume mid-flow).
- Back / Continue / Skip / Complete buttons live in a single `.step-footer` block, with `updateNavButtons()` adjusting visibility per step.
- Finalize transitions to the `data-step="finalize"` panel showing a spinner + status text, then polls `/health` with the wizard-issued `healthToken` until the app returns `mode: "normal"`.

**When adding a new instance (e.g., a follow-on wizard or one-step modal that mirrors this style):**
- Reuse the CSS class names (`.stepper`, `.stepper-step.active|done`, `.stepper-line.done`, `.step-panel.visible`, `.form-row-2`, `.review-grid`, `.test-result.success|error`, `.btn-primary | .btn-secondary | .btn-skip`). These names are SHARED with Polaris's wizard intentionally — operators of both apps see the same visual language.
- Don't introduce a JS framework for these flows. The wizard runs BEFORE the React bundle is even buildable on a fresh install.

---

## Admin-only multi-role guard

**What it is:** A backend route or frontend page restricted to users with the `Admin` role (often combined with other roles).

**Canonical implementation:**
- **Backend:** [`apps/api/src/routes/v1/settings.ts`](apps/api/src/routes/v1/settings.ts) — `settingsRouter.patch("/customization", requireRole("Admin"), ...)`.
- **Frontend:** [`apps/web/src/app/routes.tsx`](apps/web/src/app/routes.tsx) — `<RequireRole roles={["Admin"]}><SettingsLayout /></RequireRole>`.

**Key conventions:**
- Backend: chain `requireRole("Admin", "<other>")` after `requireAuth` (either as `router.use(requireAuth)` on the file or per-route). Multiple roles in the call are OR (any-of). `requireRole` reads `req.session.roles` populated by `sessionResolver`.
- Frontend: wrap the route's `element` with `<RequireRole roles={[...]}>`. The guard renders a forbidden in-shell message — does NOT redirect to `/`. This matters when a Manager bookmarks an admin URL; they see a friendly "no permission" message inside the shell, not a confusing redirect.
- Manager-scoped access to a specific user/team: use `requireManagerOf(req, targetUserId)` (returns Promise<boolean>) inside the handler. Admins always pass. This is NOT a middleware — it's a per-handler check because the target ID is path-dependent.

**When adding a new instance:**
- Decide: pure role check (use `requireRole`), or scope-of-record check (use `requireManagerOf`)? Most admin pages are the former; team-scoped pages are the latter.
- Add to BOTH the backend route AND the frontend route. The frontend gate is for UX (avoid a fetch); the backend gate is the security boundary.
- If the page should appear in the sidebar, add a role-conditional render in `AppShell.tsx`.
