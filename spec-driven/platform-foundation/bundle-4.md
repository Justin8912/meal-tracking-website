# Bundle 4: Wire & Verify

> Slice 3: Integration (Stage: integration)
> Stage: integration | Parallel: no | Files: (verification only — no new source) docker-compose.yml, apps/api/drizzle/0001_baseline.sql

**Bundle Verify**: The full foundation runs end-to-end and the data model is auth-ready.
- **Level**: integration
- **Given**: `docker compose up` with a valid `.env`
- **Action**: load the web shell, confirm `/healthz` is green, and call `/api/v1/units` through nginx→api→postgres
- **Outcome**: the SPA loads and reaches the API; units return the seeded data; the baseline migration shows workspace_id scoping + a seeded workspace

> **Context**
>
> **Applicable ACs**
> - **AC-1.2**: Given: data saved on one device / When: I open the app on another device / Then: I see the same data
> - **AC-1.3**: Given: a populated workspace / When: I reload or revisit later / Then: all previously saved data is present
> - **AC-1.4**: Given: the stored data / When: accounts are added in the future / Then: the data model can scope records to an owner/workspace without restructuring existing data
>
> **Architecture Decisions**
> - **AD-4: Auth-ready single-workspace scoping** — Decision: workspace_id NOT NULL FK convention + one seeded workspace, resolved server-side. Rationale: future auth is additive.
> - **AD-6: Docker Compose topology** — Decision: web+api+postgres with healthcheck gating.
>
> **Findings**
> - **F-6: workspace_id FK + seeded default = auth-ready** — adding users later is additive (AC-1.4).

#### STEP-20: End-to-end skeleton verification
MANUAL -> End-to-end verification that the full stack runs from compose

> **Intent**: Individual bundles verify pieces; this proves the wired whole. A request must traverse nginx→api→postgres and return seeded data, and the web shell must load and read its runtime API URL — catching integration gaps (wrong API_BASE_URL, CORS, healthcheck ordering) that unit/integration tests on single components miss.

- `docker compose up` with a valid `.env`
- Confirm postgres becomes healthy, api starts, `/healthz` returns 200
- Load the web root; confirm it reads `window._env_.API_BASE_URL` and reaches the API
- Call `/api/v1/units` through the web origin / nginx and confirm seeded data returns

**Verify**:
- Level: integration | Given: compose up with valid env | Action: load web, hit `/healthz` and `/api/v1/units` end-to-end | Outcome: SPA loads, `/healthz` 200, units return seeded data through the full stack

> Depends on: STEP-15, STEP-17 | Enables: STEP-21 | Parallel with: —

#### STEP-21: Auth-ready data model inspection
[FR-1 -> AC-1.4] | modify `apps/api/drizzle/0001_baseline.sql` (verify only) | Effort: XS

> **Intent**: AC-1.4 is a structural guarantee, not a runtime behavior — it can only be checked by inspecting the schema. The baseline must establish the `workspace_id` scoping convention and a seeded workspace so that adding a `users` table + `user_id` later is an additive migration. If the baseline lacked the seeded workspace or the FK convention, the future auth migration would require a data backfill — the exact rework AC-1.4 forbids.

- Inspect `0001_baseline.sql`: confirm a seeded default workspace (fixed UUID) exists and the workspace_id FK convention is documented for feature tables
- Confirm no auth/user tables are present (deferred) but the model can accept them additively
- Document the future-auth seam (workspace resolver, STEP-11)

**Verify**:
- Level: inspection | Given: the baseline migration and schema | Action: review for workspace scoping | Outcome: one seeded workspace (known UUID) present; workspace_id FK convention established; adding users later is additive (no backfill required)

> Depends on: STEP-20 | Enables: — | Parallel with: —
