---
slug: platform-foundation
status: final
spec_source: spec-driven/platform-foundation/spec.md
spec_tier: 1
spec_hash: sha256:fb17811413883d036a356ede54663c49cd3dd5f8dafeb5bcc30c73cf949b1abc
adaptive_flow: rich-via-context
test_approach: tdd
test_capabilities:
  unit: null
  integration: null
  e2e: null
created_date: 2026-05-29
last_updated: 2026-05-29
---

# Architectural Design: platform-foundation

## Overview

- **Spec**: Platform & Persistence Foundation — 1 FR, 4 NFRs
- **Architecture**: new (greenfield) — base layer for `recipe-library` and `weekly-planner`
- **Test approach**: tdd `[from program-wide election]`
- **Test capabilities**: unit=null, integration=null, e2e=null. **Recommended:** unit=**Vitest**, integration=**Supertest** (the foundation's testable behavior is the persistence round-trip + `/healthz` + workspace scoping, all integration-level); Docker/secrets are verified by **inspection**. e2e=Playwright is deferred to the feature specs.

> Derived by partitioning the holistic `spec-driven/meal-tracking-mvp/design.md` (provided via `--context`) to the platform scope. **[Context]**

## Technical Approach

This spec establishes the deployable skeleton and persistence layer that the feature specs build on. Nothing exists yet (greenfield).

**Monorepo (AD-1).** An npm-workspaces repo with `packages/shared` (domain types + Zod schemas), `apps/api` (Fastify), and `apps/web` (React+Vite). The `packages/nutrition-engine` package is added later by `recipe-library`; the workspace config anticipates it.

**Persistence & schema (AD-3, AD-4).** Postgres accessed via Drizzle ORM with `drizzle-kit` SQL migrations. The foundation owns the **baseline migration**: the `workspaces` table seeded with one default workspace, the `units` reference table seeded with the conversion set, and the Drizzle/migration tooling itself. Feature specs add their own tables (recipes, ingredients, tags, plan_entries, usda_food_cache) in later migrations. Every owned table carries a `workspace_id NOT NULL` FK by convention (AD-4), and the API resolves the single seeded workspace server-side until auth exists — so adding accounts later is additive (AC-1.4).

**Backend skeleton (AD-2).** A Fastify + TypeScript server with: env-var config loading (`config/env.ts`), a Drizzle/pg connection pool, pino structured logging, a global error handler that surfaces persistence failures as clean error responses (AC-1.5), and a `GET /healthz` that pings the DB (NFR-4). FR-1's "persist on change / cross-device visibility / reload persistence" is satisfied intrinsically by moving state server-side over request/response (AD-7) — no bespoke sync engine; cross-device consistency is a property of shared server storage.

**Frontend shell & runtime config (AD-5).** A Vite+React SPA built to static assets and served by nginx. Because Vite bakes env at build time (F-3), a container entrypoint renders `window._env_ = { API_BASE_URL }` via envsubst before nginx starts; the API client reads it at runtime. No secret ever reaches the bundle. The shell provides the router and two placeholder tab views that the feature specs fill in.

**Deployment (AD-6).** Docker Compose with three services — `web` (nginx), `api` (Fastify), `postgres` — all multi-stage built. Secrets (DB creds) come only from Compose `environment:`/`env_file:` (a gitignored `.env`), never build `ARG` (F-2). `postgres` has a `pg_isready` healthcheck; `api` waits for `service_healthy`.

## Findings

> Summary table — full content in `references/research.md`. Partitioned from the holistic design.

| ID | Title | Source | Confidence | Related FRs | Summary |
| --- | --- | --- | --- | --- | --- |
| F-1 | Node ~150MB image acceptable; "space efficient" = data store | web_research | high | FR-1, NFR-3 | Node image is larger than Go but fine for a personal deploy; TS chosen program-wide for engine sharing. |
| F-2 | Compose env/env_file are runtime; ARG bakes secrets | web_research | high | NFR-2 | Read secrets from `process.env` via Compose; never build ARG; gitignore `.env`. |
| F-3 | Vite bakes env at build; runtime injection needed | web_research | high | NFR-2 | `window._env_` + envsubst entrypoint injects API URL at runtime; no secret in bundle. |
| F-4 | Fastify + pino + Zod is a small, AI-friendly Node stack | web_research | medium | FR-1, NFR-1, NFR-4 | Fastify is light and fast (low request overhead → smooth UX, NFR-1); pino gives structured logs (NFR-4); Zod validates at the edge. |
| F-5 | Hybrid Postgres schema via Drizzle + SQL migrations | web_research | high | FR-1 | Macro columns + micronutrient JSONB (feature tables); Drizzle is TS-first and lightweight. |
| F-6 | workspace_id FK + seeded default = auth-ready | web_research | high | FR-1, NFR-2 | Every owned table gets a NOT NULL workspace FK + one seeded workspace; future auth is additive (AC-1.4). |

## Architecture Decisions

### AD-1: npm-workspaces monorepo

- **Context**: Frontend (React) and backend (Node) plus shared domain types and a future shared nutrition engine must coexist with one dependency graph and consistent tooling.
- **Decision**: We will use a single npm-workspaces monorepo: `packages/shared` (types + Zod), `apps/api` (Fastify), `apps/web` (React+Vite). The workspace config anticipates `packages/nutrition-engine` (added by `recipe-library`).
- **Rationale**: One install/tooling surface; shared types/schemas keep the API contract honest on both sides (F-4). Sets up the program-wide goal of a shared, once-written nutrition engine.
- **Alternatives Considered**: Separate repos — rejected (duplicates types/contract, splits tooling). Polyglot backend (Go/Python) — rejected program-wide because it prevents sharing the TS engine (see holistic AD-2).

### AD-2: Fastify + TypeScript backend

- **Context**: The backend must persist data, expose health, log structurally, and stay simple; the frontend is React/TS.
- **Decision**: We will build the API with Fastify + TypeScript, pino logging, Zod request/response validation, and a `GET /healthz` liveness+DB-ping endpoint.
- **Rationale**: TS enables shared types/engine (AD-1); Fastify is light and fast, pino satisfies NFR-4 structured logging, Zod validates at the boundary (F-4). A ~150MB image is acceptable here (F-1).
- **Alternatives Considered**: Express (heavier, no built-in structured logging); Go/Python (smaller image but no engine sharing — see holistic AD-2).

### AD-3: Postgres + Drizzle ORM with versioned SQL migrations; foundation owns the baseline migration

- **Context**: A normalized, space-efficient relational store is needed; feature specs add tables incrementally; schema changes must be reviewable.
- **Decision**: We will use Postgres via Drizzle ORM with `drizzle-kit` migrations. The foundation's baseline migration creates and seeds `workspaces` (one default row) and `units` (the conversion set), and establishes the migration tooling. Feature specs add their tables in later migrations.
- **Rationale**: Drizzle is TS-first and lightweight (no heavy query-engine binary), keeps the schema explicit, and fits AD-1/AD-2 (F-5). A seeded baseline lets feature specs assume the workspace and units exist.
- **Alternatives Considered**: Prisma (heavier runtime); Kysely + node-pg-migrate (viable lighter-typed alternative); raw SQL only (loses type safety).

### AD-4: Auth-ready single-workspace scoping

- **Context**: MVP is a single shared workspace, but auth must be addable later without restructuring (NFR-2, AC-1.4).
- **Decision**: We will require a `workspace_id UUID NOT NULL` FK on every owned table (a documented convention enforced per feature migration), seed exactly one default workspace, and resolve that workspace id server-side in the API until auth exists.
- **Rationale**: Shared-schema multi-tenancy with a seeded tenant FK makes future auth purely additive (add users + membership + user_id) with no backfill (F-6).
- **Alternatives Considered**: No tenancy column now (forces a later backfill + NOT NULL tightening); nullable owner_id (weaker integrity).

### AD-5: Static frontend image with runtime env injection

- **Context**: Deploy call-out requires runtime env config, but Vite bakes config at build time (F-3); the frontend must hold no secrets.
- **Decision**: We will multi-stage build the SPA (`vite build` → nginx) and render `window._env_ = { API_BASE_URL }` from env vars via an envsubst entrypoint at container start; the API client reads it. nginx adds SPA history fallback; `env-config.js` is served `no-cache`.
- **Rationale**: One immutable image promotes across environments with runtime config (F-3), satisfying NFR-2.
- **Alternatives Considered**: Build-per-environment (`VITE_` vars) — not one image, risks baking config. Serving the SPA from the API — couples lifecycles; nginx is a better static server.

### AD-6: Docker Compose topology with runtime-only secrets

- **Context**: Deploy call-outs require FE + BE as Docker images with secrets only as env vars; NFR-4 wants a simple repeatable deploy with health checks.
- **Decision**: We will define three Compose services — `web` (nginx), `api` (Fastify), `postgres` — all multi-stage built. Secrets come from Compose `environment:`/`env_file:` (gitignored `.env`), never build `ARG`. `postgres` has a `pg_isready` healthcheck; `api` `depends_on` it `service_healthy`.
- **Rationale**: Compose env/env_file are runtime and stay out of image layers (F-2), satisfying NFR-2; healthcheck gating + pino logs satisfy NFR-4.
- **Alternatives Considered**: Docker secrets / external secret manager — heavier than needed; env vars suffice. Build ARG for config — bakes into layers.

### AD-7: Cross-device sync via server-side request/response (no bespoke sync engine)

- **Context**: FR-1 requires data visible across devices and persisted on change, with failures surfaced (AC-1.5), while keeping the UI smooth (NFR-1).
- **Decision**: We will treat cross-device sync as an intrinsic property of server-side storage over request/response — clients read/write through the API; there is no offline store or sync/merge engine in MVP. Writes surface a clear error to the user when the server-side save fails, and the low-overhead Fastify stack (F-4) keeps responses fast enough for a smooth UI (NFR-1).
- **Rationale**: For a small shared workspace, request/response over Postgres on the lightweight Fastify stack (F-4) gives consistent cross-device data with the least complexity and adequate responsiveness (NFR-1); a sync/merge engine would be unjustified for MVP and is reconsiderable if offline support is added later.
- **Alternatives Considered**: Local-first store + sync engine (CRDT/replication) — large complexity, unnecessary for MVP. WebSocket push for live multi-device updates — deferred; refresh/refetch suffices.

## Resolved Uncertainties

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 1 | What backend stack? | Node + Fastify + TS (program-wide, for engine sharing) | F-1; holistic AD-2 in `spec-driven/meal-tracking-mvp/design.md` |
| 2 | How are secrets injected without baking? | Runtime Compose env/env_file; never build ARG | F-2 |
| 3 | How does a static frontend get its API URL at runtime? | `window._env_` + envsubst entrypoint | F-3 |
| 4 | How to be auth-ready without a restructure? | `workspace_id` NOT NULL FK + one seeded workspace | F-6 |
| 5 | Is a sync engine needed for cross-device? | No — server-side request/response suffices for MVP | AD-7 rationale |

## Standards

> Full inventory in `references/standards.md`.

| ID | Rule | Domain | File Type | Action Type | Source |
| --- | --- | --- | --- | --- | --- |
| S-1 | Secrets only from runtime env vars; never hardcoded or in build ARG | security | * | * | design constraint (NFR-2) |
| S-2 | Run lint before committing TS/JS | other | .ts, .tsx | * | global CLAUDE.md |
| S-3 | Validate API inputs/outputs at the boundary with shared Zod schemas | api-design | .ts | create | AD-1, AD-2 |
| S-4 | Use Drizzle/parameterized queries; never string-concatenate SQL | security | .ts, .sql | * | AD-3 |
| S-5 | Schema changes go through versioned drizzle-kit migrations | other | .sql, .ts | create | AD-3 |
| S-6 | No emojis in code, comments, commits, or UI copy | other | * | * | global CLAUDE.md |

## File Inventory

| Action | Path | Related FRs | Rationale |
| --- | --- | --- | --- |
| create | package.json | — | Root npm-workspaces manifest (AD-1) |
| create | tsconfig.base.json | — | Shared TS config |
| create | packages/shared/src/types.ts | FR-1 | Shared domain types (Workspace, Unit, error shape) |
| create | packages/shared/src/schemas.ts | FR-1 | Shared Zod schemas (S-3) |
| create | apps/api/src/server.ts | FR-1 | Fastify bootstrap, pino, error handler, /healthz (AD-2) |
| create | apps/api/src/config/env.ts | NFR-2 | Env var loading (DB creds) (S-1) |
| create | apps/api/src/db/client.ts | FR-1 | Drizzle + pg pool (AD-3) |
| create | apps/api/src/db/schema.ts | FR-1 | Drizzle schema: workspaces, units (AD-3) |
| create | apps/api/drizzle/0001_baseline.sql | FR-1, NFR-2 | Baseline migration: workspaces + units + seed (AD-3, AD-4) |
| create | apps/api/src/workspace.ts | FR-1, NFR-2 | Server-side resolution of the seeded workspace (AD-4) |
| create | apps/api/src/routes/health.ts | NFR-4 | GET /healthz with DB ping |
| create | apps/web/index.html | — | SPA entry; loads env-config.js before bundle (AD-5) |
| create | apps/web/src/main.tsx | FR-1 | React entry; reads window._env_ (AD-5) |
| create | apps/web/src/router.tsx | — | Router + two placeholder tab views |
| create | apps/web/src/api/client.ts | FR-1 | Fetch wrapper to window._env_.API_BASE_URL |
| create | apps/web/public/env-config.template.js | NFR-2 | envsubst template for window._env_ (AD-5) |
| create | apps/web/docker-entrypoint.sh | NFR-2 | Render env-config.js then start nginx (AD-5) |
| create | apps/web/nginx.conf | — | SPA fallback; no-cache env-config.js (AD-5) |
| create | apps/web/Dockerfile | NFR-2 | Multi-stage Vite→nginx (AD-5) |
| create | apps/api/Dockerfile | NFR-2 | Multi-stage Node build (AD-2, AD-6) |
| create | docker-compose.yml | NFR-2, NFR-4 | web+api+postgres, healthcheck, env_file (AD-6) |
| create | .env.example | NFR-2 | Documents required env vars (no real secrets) |
| create | .dockerignore | — | Keep build context lean |
| modify | .gitignore | NFR-2 | Ignore .env (S-1) |

## Dependencies and Coupling

| Feature Area | Shared Files | Recommendation |
| --- | --- | --- |
| FR-1 (contract) | `packages/shared/*` | Define shared types + Zod + the error envelope first; feature specs import them. |
| FR-1 (schema) | `apps/api/src/db/schema.ts`, `drizzle/0001_baseline.sql` | The baseline migration (workspaces + units + seed) must land before any feature migration; it is the walking-skeleton seed. |
| FR-1 (skeleton) | `apps/api/src/server.ts`, `apps/web/src/main.tsx`, `docker-compose.yml` | Wire the end-to-end skeleton (web→api→postgres→/healthz) before feature work; this proves the architecture. |

> Downstream: `recipe-library` and `weekly-planner` add tables/routes/views on top of this foundation; they must not duplicate the baseline.

## Spec Deviations

None — all spec values preserved.

## Open Questions

None — workspace identity (single global workspace) and secret handling were resolved upstream. Non-blocking: the exact managed-Postgres host/tier is a deployment-time choice.

## Constraints (Technical)

| Constraint | Category | Source | Rationale |
| --- | --- | --- | --- |
| Secrets only via runtime env vars; never build ARG | security | technical | Build ARG bakes into image layers (AD-6, F-2) |
| Vite bakes import.meta.env at build time | compatibility | technical | Static image needs runtime injection (AD-5, F-3) |
| Every owned table carries a workspace_id NOT NULL FK | infrastructure | technical | Auth-readiness without a later restructure (AD-4, F-6) |

## Assumptions

| Assumption | Source | Affects |
| --- | --- | --- |
| A ~150MB Node image + low-cost managed Postgres are acceptable | design | FR-1, NFR-3 |
| Cross-device consistency via request/response is sufficient (no offline/sync engine) for MVP | design | FR-1 |

## Risks (Technical)

| Risk | Impact | Probability | Mitigation | Affects |
| --- | --- | --- | --- | --- |
| Secrets accidentally baked into an image or committed `.env` | high | low | Runtime env vars only; gitignore `.env`; no build ARG (AD-6, S-1) | FR-1, NFR-2 |
| Stale `env-config.js` cached pins an old API URL | medium | low | Serve `env-config.js` no-cache (AD-5) | FR-1, NFR-2 |
| Baseline migration drift across feature specs (duplicate/omitted seed) | medium | low | Foundation owns the baseline; feature migrations build on it only (AD-3) | FR-1 |

## References

- See `references/research.md` for full findings (partitioned from the holistic design)
- See `references/standards.md` for the complete standards inventory
- See `references/contracts.md` for the health endpoint and error envelope
