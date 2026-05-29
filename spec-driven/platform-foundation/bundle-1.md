# Bundle 1: Backend Skeleton

> Slice 1: Walking Skeleton (Stage: skeleton)
> Stage: skeleton | Parallel: no | Files: package.json, tsconfig.base.json, packages/shared/src/*, apps/api/src/*, apps/api/drizzle/0001_baseline.sql

**Bundle Verify**: The API skeleton starts, connects to Postgres, and reports health end-to-end.
- **Level**: integration
- **Given**: Postgres running with the baseline migration applied, API started with DB env vars
- **Action**: `GET /healthz`
- **Outcome**: 200 `{ "status": "ok" }` when the DB is reachable; 503 with the error envelope when the DB is down

> **Context**
>
> **Applicable ACs**
> - **AC-1.3**: Given: a populated workspace / When: I reload or revisit the app later / Then: all previously saved data is present
> - **AC-1.4**: Given: the stored data / When: accounts are added in the future / Then: the data model can scope records to an owner/workspace without restructuring existing data
> - **AC-1.5**: Given: a create/edit/delete action / When: the server-side save fails or times out / Then: the user is notified the change was not persisted
>
> **Architecture Decisions**
> - **AD-2: Fastify + TypeScript backend** — Decision: Fastify + TS, pino logging, Zod validation, GET /healthz liveness+DB-ping. Rationale: TS enables shared types/engine; pino satisfies NFR-4; ~150MB image acceptable.
> - **AD-3: Postgres + Drizzle with versioned migrations; foundation owns the baseline** — Decision: Drizzle ORM + drizzle-kit; baseline migration creates+seeds workspaces (one default row) and units. Rationale: TS-first, lightweight, explicit schema; feature specs assume the seed exists.
> - **AD-4: Auth-ready single-workspace scoping** — Decision: workspace_id NOT NULL FK on every owned table, one seeded workspace, resolved server-side. Rationale: future auth is additive (no backfill).
>
> **Findings**
> - **F-5: Hybrid Postgres schema via Drizzle + SQL migrations** — Drizzle is TS-first and lightweight; the foundation owns the baseline (workspaces + units + seed).
> - **F-6: workspace_id FK + seeded default = auth-ready** — Every owned table gets a NOT NULL workspace FK + one seeded workspace; future auth is additive (AC-1.4).
> - **F-4: Fastify + pino + Zod is a small, AI-friendly Node stack** — pino gives structured logs (NFR-4); Zod validates at the edge.
>
> **Standards**
> - **S-1**: Secrets only from runtime env vars; never hardcoded or in build ARG (Domain: security | File Type: *)
> - **S-3**: Validate API inputs/outputs at the boundary with shared Zod schemas (Domain: api-design | File Type: .ts)
> - **S-4**: Use Drizzle/parameterized queries; never concatenate SQL (Domain: security | File Type: .ts/.sql)
> - **S-5**: Schema changes go through versioned drizzle-kit migrations (Domain: other | File Type: .sql/.ts)
> - **S-6**: No emojis (Domain: other | File Type: *)
>
> **Constraints**
> - Every owned table carries a workspace_id NOT NULL FK (Category: infrastructure | Source: technical)
> - Secrets only via runtime env vars; never build ARG (Category: security | Source: technical)
>
> **Contracts**
> - GET /healthz — liveness + DB ping; 200 `{status:"ok"}` or 503 with error envelope
> - Error envelope (shared): `{ "error": { "code": string, "message": string } }`

#### STEP-1: Monorepo scaffold (npm workspaces)
MANUAL -> Repository scaffolding for the npm-workspaces monorepo

> **Intent**: N/A — structural step

- Create root `package.json` with `workspaces: ["packages/*", "apps/*"]` and scripts (lint, test, build); pin Node engine
- Create `tsconfig.base.json` with strict mode; apps/packages extend it
- Add `packages/shared`, `apps/api`, `apps/web` workspace package.json stubs; anticipate `packages/nutrition-engine`
- Follow AD-1 structure

**Verify**:
- Level: inspection | Given: the repo root | Action: run `npm install` (or `npm ls --workspaces`) | Outcome: workspaces resolve with no errors and the three packages are linked

> Depends on: — | Enables: STEP-3, STEP-5, STEP-6 | Parallel with: —

#### STEP-2: Test-first — shared schema parsing
MANUAL -> Test-first for STEP-3

> **Intent**: The shared Zod schemas are the single source of truth for the API contract (S-3). A schema that silently accepts malformed input (e.g., a unit with a null code, or an error envelope missing `code`) lets contract drift through to both client and server.

- Write Vitest tests for `packages/shared` schemas: a valid Unit/Workspace parses; an invalid one (missing required field) is rejected; the error-envelope schema requires `error.code` and `error.message`
- Tests must fail before STEP-3 exists

**Verify**:
- Level: unit | Given: the shared schema test file | Action: run Vitest before STEP-3 | Outcome: tests fail (module not implemented), confirming they exercise real behavior

> Depends on: STEP-1 | Enables: STEP-3 | Parallel with: —

#### STEP-3: Shared domain types and Zod schemas
[FR-1 -> AC-1.4] | create `packages/shared/src/types.ts`, `packages/shared/src/schemas.ts` | Effort: S

> **Intent**: These types define the workspace-scoped contract the whole program reuses. The `Workspace`/`Unit` types and the shared error envelope must match the DB schema and the contract in `contracts.md`; a divergence here propagates to every feature spec. Zod schemas (not just TS types) are required so the API can validate at runtime (S-3).
> **Standards**: S-3 (Zod boundary validation), S-6 (no emojis)

- Define `Workspace`, `Unit`, and the shared `ErrorEnvelope` types
- Define matching Zod schemas; export both types and schemas
- Make these the single import source for api and web

**Verify**:
- Level: unit | Given: the schemas from STEP-2 | Action: run Vitest | Outcome: valid inputs parse, invalid inputs are rejected, error envelope requires code+message — tests pass

> Depends on: STEP-2 | Enables: STEP-9, STEP-17 | Parallel with: —

#### STEP-4: Test-first — env config loader
MANUAL -> Test-first for STEP-5

> **Intent**: Secrets must come only from the environment (S-1, NFR-2). The loader must fail fast at startup if a required var (e.g., `DATABASE_URL`) is missing — a silent undefined leads to a confusing runtime crash deep in the DB layer instead of a clear boot error.

- Write Vitest tests: loader returns parsed config when all required env vars are set; throws a clear error naming the missing var when one is absent
- Tests fail before STEP-5

**Verify**:
- Level: unit | Given: env with a required var unset | Action: call the config loader | Outcome: throws an error naming the missing variable (not a generic undefined access)

> Depends on: STEP-1 | Enables: STEP-5 | Parallel with: —

#### STEP-5: Environment config loader
[FR-1 -> AC-1.5] | create `apps/api/src/config/env.ts` | Effort: XS

> **Intent**: All secrets (DB credentials) are read here from `process.env` and nowhere else (S-1). Hardcoding a fallback credential would defeat the runtime-secret constraint and could ship a default secret to production.
> **Standards**: S-1 (secrets from env only), S-6

- Read and validate required env vars (`DATABASE_URL` or discrete DB_* vars) with Zod; throw on missing
- Export a typed `config` object; never log secret values

**Verify**:
- Level: unit | Given: required env vars set | Action: load config | Outcome: returns typed config; with a var missing, throws naming it

> Depends on: STEP-4 | Enables: STEP-6, STEP-9 | Parallel with: —

#### STEP-6: Drizzle schema and DB client
[FR-1 -> AC-1.1] | create `apps/api/src/db/schema.ts`, `apps/api/src/db/client.ts` | Effort: S

> **Intent**: The `workspaces` and `units` tables defined here are the baseline every feature table will FK to (AD-4). The `units` table must carry `grams_per_unit` as nullable (NULL for `qty`), and `workspaces` must use a stable UUID PK so the seeded default workspace id can be referenced by feature migrations. Use a pooled connection — opening a connection per request exhausts Postgres under load.
> **Standards**: S-4 (Drizzle/parameterized), S-5 (migrations), S-6

- Define Drizzle schema for `workspaces` (id uuid pk, name, created_at) and `units` (code pk, label, grams_per_unit numeric null)
- Create a pooled Drizzle client from `config` (STEP-5)
- Export the client and schema for routes and migrations

**Verify**:
- Level: integration | Given: a running Postgres | Action: import the client and run `SELECT 1` via Drizzle | Outcome: query succeeds through the pool (no per-request connection)

> Depends on: STEP-5 | Enables: STEP-7, STEP-9, STEP-11 | Parallel with: —

#### STEP-7: Baseline migration and seed
[FR-1 -> AC-1.4] | create `apps/api/drizzle/0001_baseline.sql` | Effort: S

> **Intent**: This is the foundation's owned baseline (AD-3). It must create `workspaces` and `units`, seed exactly one default workspace with a fixed/known UUID (so feature migrations and server-side resolution can reference it — AD-4), and seed the unit conversion set (g, tsp, tbsp, fl oz, cup, quart, qty with grams_per_unit; qty NULL). Re-running the seed must not duplicate rows (use a deterministic id / ON CONFLICT). Feature specs build on this; they must not redefine workspaces/units.
> **Standards**: S-5 (versioned migration), S-4

- Create `workspaces` and `units` tables matching the Drizzle schema
- Seed one default workspace (fixed UUID) idempotently (ON CONFLICT DO NOTHING)
- Seed the 7 unit rows with correct grams_per_unit (qty = NULL)

**Verify**:
- Level: integration | Given: a fresh Postgres | Action: apply 0001_baseline then query workspaces and units | Outcome: exactly one default workspace row (known UUID) and 7 unit rows with qty.grams_per_unit IS NULL; re-applying the seed adds no duplicates

> Depends on: STEP-6 | Enables: STEP-11, STEP-17 | Parallel with: —

#### STEP-8: Test-first — /healthz behavior
MANUAL -> Test-first for STEP-9

> **Intent**: `/healthz` is the deploy readiness gate (NFR-4) — Compose uses it to know the API is up. It must return 503 (not 200) when the DB is unreachable; a health check that only confirms the process is alive lets Compose route traffic to an API that can't serve data.

- Write a Supertest integration test: with DB reachable, `GET /healthz` returns 200 `{status:"ok"}`; with the DB pool pointed at an unreachable host, returns 503 with the error envelope
- Tests fail before STEP-9

**Verify**:
- Level: integration | Given: the healthz test | Action: run Supertest before STEP-9 | Outcome: tests fail (route not implemented)

> Depends on: STEP-6 | Enables: STEP-9 | Parallel with: —

#### STEP-9: Fastify server, logging, error handler, /healthz
[FR-1 -> AC-1.5] | create `apps/api/src/server.ts`, `apps/api/src/routes/health.ts` | Effort: M

> **Intent**: The global error handler is what makes AC-1.5 real — any thrown/persistence error must be serialized into the shared error envelope with an appropriate status (5xx for save failures), never a raw stack trace or an HTML error page that the frontend can't parse. pino must emit structured JSON (NFR-4). `/healthz` pings the DB (STEP-6) and returns 503 on failure.
> **Standards**: S-3 (Zod), S-1 (no secret logging), S-6

- Bootstrap Fastify with pino structured logging (do not log secret values)
- Register a global error handler that returns the shared `ErrorEnvelope` with correct status codes
- Implement `GET /healthz` (DB ping → 200/503) under base path `/api/v1` (health may be unprefixed)
- Mount on a port from `config`

**Verify**:
- Level: integration | Given: DB reachable | Action: `GET /healthz` | Outcome: 200 `{status:"ok"}`
- Level: integration | Given: DB unreachable | Action: `GET /healthz` | Outcome: 503 with `{error:{code,message}}` (not an HTML/stack response)

> Depends on: STEP-3, STEP-5, STEP-6 | Enables: STEP-17, STEP-19 | Parallel with: —

#### STEP-10: Test-first — workspace resolution
MANUAL -> Test-first for STEP-11

> **Intent**: Until auth exists, every request operates on the single seeded workspace (AD-4). The resolver must return the seeded workspace's id consistently; if it returned a random or null id, feature writes would be unscoped and the future auth migration would have inconsistent data to attach users to.

- Write a Vitest/Supertest test: the resolver returns the seeded default workspace id; it is stable across calls
- Tests fail before STEP-11

**Verify**:
- Level: integration | Given: the seeded workspace from STEP-7 | Action: call the workspace resolver | Outcome: returns the known default workspace UUID, stably

> Depends on: STEP-7 | Enables: STEP-11 | Parallel with: —

#### STEP-11: Server-side workspace resolution helper
[FR-1 -> AC-1.4] | create `apps/api/src/workspace.ts` | Effort: XS

> **Intent**: This helper is the single seam that future authentication will replace (AD-4) — today it returns the seeded workspace id; later it will derive the workspace/user from a token. Keeping it isolated means adding auth is an additive change to one function, not a refactor across every route.
> **Standards**: S-4, S-6

- Implement `resolveWorkspaceId()` returning the seeded default workspace id (from config or a single query)
- Document that this is the future auth seam

**Verify**:
- Level: integration | Given: the seeded workspace | Action: call `resolveWorkspaceId()` | Outcome: returns the known default workspace UUID

> Depends on: STEP-10 | Enables: STEP-17, STEP-19 | Parallel with: —
