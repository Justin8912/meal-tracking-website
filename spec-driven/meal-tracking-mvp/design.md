---
slug: meal-tracking-mvp
status: final
spec_source: spec-driven/meal-tracking-mvp/spec.md
spec_tier: 1
spec_hash: sha256:8e34908fc14c5660a982f0384a843f2675a322123e13b1d87338b333c45958d3
adaptive_flow: minimal
test_approach: tdd
test_capabilities:
  unit: null
  integration: null
  e2e: null
created_date: 2026-05-29
last_updated: 2026-05-29
---

# Architectural Design: meal-tracking-mvp

## Overview

- **Spec**: Meal Tracking Website (MVP) — 12 FRs, 7 NFRs
- **Architecture**: new (greenfield)
- **Test approach**: tdd `[from NFR-3 + user election: full TDD]`
- **Test capabilities**: unit=null, integration=null, e2e=null — nothing exists yet. **Recommended (greenfield):** unit=**Vitest** (shared nutrition-engine is algorithmic and NFR-3-critical — must be unit-tested first), integration=**Supertest** (Fastify routes cross into Postgres and the USDA proxy — AD-7), e2e=**Playwright** (the FR-10 drag-and-drop edit flow and FR-7 planning flow are full user journeys; Playwright also drives touch emulation to verify AC-10.4).

## Technical Approach

This is a greenfield build. The only existing code is a reference-only React prototype (`artifacts/food-tracker.jsx`) whose component structure and — critically — whose nutrition math are reusable, but whose persistence (`window.storage`), drag-and-drop (native HTML5), and unit-conversion table are **not** fit for the MVP and are deliberately replaced.

**Project shape (AD-1).** A single TypeScript monorepo using npm workspaces with two apps and two shared packages:
- `packages/nutrition-engine` — the pure, dependency-free calculation core (AD-3). It is the accuracy-critical heart of the product (NFR-3) and is imported by *both* the frontend (instant live recalc while editing — FR-4/AC-4.4) and the backend (authoritative totals + the FR-12 weekly summary). Writing it once is the main reason the stack is TypeScript end-to-end (AD-2).
- `packages/shared` — domain types and Zod schemas shared by API and web (request/response validation, one source of truth for the data contract).
- `apps/api` — Fastify backend (AD-2): persistence, the USDA proxy/cache (AD-7), and authoritative nutrition.
- `apps/web` — React + Vite + TypeScript SPA (AD-9, AD-10, AD-11).

**Recipe library & nutrition (FR-1–6, FR-4).** Recipe CRUD, tagging, filtering, and search are standard Fastify REST resources over Postgres (AD-4). When a recipe is viewed or edited, the frontend computes nutrition live by calling the shared engine; the backend uses the same engine for the stored/aggregate values, so there is exactly one implementation to unit-test (AD-3). Ingredients come either from the USDA proxy (AD-7) or from custom user entry (FR-3); in both cases the ingredient's nutrition is **snapshotted into its own row per a 100 g reference basis** at add-time (AD-8) so later cache eviction or USDA changes never silently rewrite historical recipes (F-13).

**Volume accuracy (FR-4, NFR-3).** The prototype's single water-equivalent units table is ~2× wrong for flour and off for oil (F-19). The MVP instead resolves grams via **per-ingredient gram-equivalents** for volume units and per-ingredient usual-weight for `qty`, **pre-filled at entry and confirmed/overridable by the user** (AD-8). The engine keeps full precision internally, rounds only at display, aggregates micronutrients as an absolute-mass keyed union, and returns a **completeness descriptor** rather than treating missing data as zero (AD-3, F-20).

**USDA FoodData Central (FR-2, FR-3, NFR-4, NFR-5, NFR-7).** The API key is a query parameter, so all calls go through a server-side proxy that injects the key from an env var — the browser never sees it (AD-7, F-14). Responses are cached **cache-aside in Postgres**, which also serves as the graceful-degradation store: on USDA timeout/429/5xx the proxy serves stale cache if present, otherwise returns a clear error and the UI steers the user to custom-ingredient entry (NFR-7). Search queries `Foundation` + `SR Legacy` first (per-100g, complete micronutrients); `Branded` is a fallback tier. Nutrients are mapped by stable USDA **nutrient number** (208/203/204/205/291 + micros), and missing nutrients are treated as unknown, not zero (F-16).

**Weekly planner (FR-7–10, FR-12).** Plan entries live in one table keyed by **`week_start_date` (the Monday's DATE)** — not the prototype's buggy `YYYY-Www` string (F-11) — with a row that is *either* a recipe reference *or* a freeform meal, enforced by a XOR CHECK (AD-4). Week navigation/history is range-queried by date. The frontend uses **TanStack Query keyed by week** so revisiting a week is instant from cache (AD-10). The edit mode's drag-and-drop is rebuilt on **dnd-kit** (mouse + touch + keyboard) with a touch activation delay and a **tap-to-assign fallback**, because the prototype's HTML5 DnD categorically fails on touch (AD-9, F-2/F-3) and AC-10.4 requires touch.

**Deployment (deploy call-outs 1+2, NFR-4, NFR-6).** Three Docker services via Compose (AD-12): `web` (Vite static build served by nginx), `api` (Fastify), `postgres`. All builds are multi-stage. Secrets (DB creds, `USDA_API_KEY`) are injected **only at runtime** via Compose `environment:`/`env_file:` — never via build `ARG` (F-7). Because a Vite build bakes config at build time, the web image injects its API base URL at container start via a `window._env_` script rendered by envsubst (AD-11, F-5), so one immutable image runs in any environment. Structured logging is pino (Fastify built-in) and the API exposes `/healthz`; Postgres readiness gates the API via a `pg_isready` healthcheck (NFR-6).

## Findings

> Summary table only — full finding content is in `references/research.md`.

| ID | Title | Source | Confidence | Related FRs | Summary |
| --- | --- | --- | --- | --- | --- |
| F-1 | Prototype is React; components/math port directly | codebase | high | FR-1,5,6,7,8,9,12 | The reference prototype's component tree and nutrition functions are reusable in a React build, minimizing rework. |
| F-2 | Prototype DnD is HTML5 — fails on touch | codebase | high | FR-10 | `draggable`/`dataTransfer`/`onDrop` do not fire for touch input, so AC-10.4 cannot be met by porting it. |
| F-3 | dnd-kit unifies mouse/touch/keyboard | web_research | high | FR-10, NFR-2 | One PointerSensor with activation constraints supports touch (delay) + mouse (distance) + keyboard/a11y. |
| F-4 | TanStack Query handles async + week caching | web_research | high | FR-1,7,9,12 | Caching/dedup/retry/loading/error out of the box; week-keyed queries make navigation instant. |
| F-5 | Vite bakes env at build; runtime injection needed | web_research | high | NFR-4 | A static build can't be repointed per env; `window._env_` + envsubst entrypoint injects API URL at runtime. |
| F-6 | Image sizes: Go ~15MB, Node ~150MB, Python ~50-130MB | web_research | high | NFR-5 | Go is far smaller, but a personal Docker deploy tolerates ~150MB; "space efficient" read as data/Postgres, not image. |
| F-7 | Compose env/env_file are runtime; ARG bakes secrets | web_research | high | NFR-4 | Reading secrets from `os/process.env` via Compose keeps them out of image layers; build ARG must not be used. |
| F-8 | Fastify + pino + Zod is a small, AI-friendly Node stack | web_research | medium | FR-11, NFR-6 | Fastify is lighter than Express; pino gives structured logs (NFR-6); Zod validates at the edge. |
| F-9 | Hybrid columns+JSONB beats EAV for sparse nutrients | web_research | high | FR-4 | Macros as columns (hot, fixed), micronutrients as JSONB (sparse, display-only); EAV worse on every axis. |
| F-10 | workspace_id FK + seeded default = auth-ready | web_research | high | FR-11, NFR-4 | Stamp every owned row with a NOT NULL workspace FK now; adding users later is purely additive (AC-11.4). |
| F-11 | Prototype week-key has ISO/year-boundary bug | codebase | high | FR-9 | Identify a week by the Monday's DATE server-side; do not port the `YYYY-Www` string logic. |
| F-12 | Concrete normalized schema sketch | training_knowledge | medium | FR-1,7,11, NFR-4 | Tables: workspaces, units, ingredients, recipes, recipe_ingredients, tags, recipe_tags, plan_entries, usda_food_cache. Corroborated against the prototype's data shapes, not live-verified. |
| F-13 | Snapshot USDA nutrition into ingredient at add-time | codebase | high | FR-2,4 | Keep usda_food_cache as a pure accelerator; recipes reference a stable owned ingredient snapshot. |
| F-14 | USDA: api_key query param, 1000 req/hr, server-side | web_research | high | FR-2, NFR-4,5 | Key in URL forces a server proxy; 1000/hr free tier demands caching; X-RateLimit headers enable backoff. |
| F-15 | Search (flat) vs detail (nested) nutrient shapes | web_research | medium | FR-2,4 | Two parsers needed; map by stable nutrient *number* (macros 208/203/204/205/291 high-confidence; specific micronutrient numbers to verify against a live Foundation response). |
| F-16 | Foundation+SR per-100g complete; Branded per-serving/missing | web_research | high | FR-4 | Query Foundation+SR Legacy first; treat missing branded nutrients as unknown, not zero. |
| F-17 | Postgres cache-aside doubles as degradation store | web_research | high | NFR-5,7 | Serve stale cache on USDA outage; no extra service (Redis rejected on space/simplicity). |
| F-18 | Prototype calc engine is pure and extractable | codebase | high | NFR-3, FR-4 | No I/O/Date/framework deps; lift into a standalone module that's trivially unit-testable. |
| F-19 | Fixed water-equivalent volume is ~2× off for flour | web_research | high | FR-4, NFR-3 | 1 cup flour ≈125g vs prototype's 240g; volume needs per-ingredient gram-equivalents. |
| F-20 | Round-at-display; flag missing data, don't zero it | codebase | high | NFR-3 | Prototype rounds mid-calc and zero-fills missing nutrients; both understate/mislead and must be fixed. |

## Architecture Decisions

### AD-1: TypeScript monorepo with a shared nutrition-engine package

- **Context**: The nutrition calculation is accuracy-critical (NFR-3) and is needed in two places — the frontend (instant live recalc as a recipe is edited, AC-4.4) and the backend (authoritative persistence + FR-12 weekly aggregate). Duplicating it risks divergence and doubles the NFR-3 test surface.
- **Decision**: We will use a single npm-workspaces monorepo with `packages/nutrition-engine` (pure calc core), `packages/shared` (domain types + Zod schemas), `apps/api` (Fastify), and `apps/web` (React+Vite). The engine and contract types are imported by both apps.
- **Rationale**: One implementation of the calc core (F-18) means one place to unit-test for NFR-3; shared Zod schemas (F-8) keep the API contract honest on both sides. This is the decisive reason the backend is TypeScript (AD-2).
- **Alternatives Considered**: Separate repos / polyglot stack (Go or Python backend, AD-2 alternatives) — rejected because the engine would then exist twice (TS for the browser, backend-language for the server) or force a network round-trip on every keystroke-level recalc.

### AD-2: Fastify + TypeScript backend

- **Context**: The user is "not very picky" on the backend but wants space efficiency; the frontend is React/TS; the engine must be shared (AD-1).
- **Decision**: We will build the backend with Fastify on Node.js + TypeScript.
- **Rationale**: TypeScript enables the shared engine/types (AD-1); Fastify is lighter and faster than Express, ships pino structured logging for NFR-6, and pairs naturally with Zod validation (F-8). A ~150MB Node image is acceptable for a personal Docker deploy, and "space efficient" is read as referring to the Postgres data store we use regardless (F-6).
- **Alternatives Considered**: **Go + chi + sqlc** (F-6) — ~10-20MB image and lowest memory, but the engine could not be shared with the browser without a second implementation or a network round-trip; rejected for that reason despite the smaller image. **Python + FastAPI** — same engine-sharing problem and a larger image than Go.

### AD-3: Pure, deterministic, shared nutrition engine; full precision, round at display, completeness flags

- **Context**: NFR-3 demands accurate, unit-tested nutrition. The prototype rounds mid-calculation, silently treats missing data as zero, and uses a single global volume table (F-19, F-20).
- **Decision**: We will implement `computeRecipeNutrition(ingredients, servings) -> { total, perServing, completeness }` as a pure, dependency-free module: convert each ingredient to grams (mass directly; volume via per-ingredient gram-equivalent; `qty` via per-ingredient usual-weight), scale per-100g nutrient values, sum macros and the **absolute-mass** union of micronutrients in full float precision, divide by `max(servings,1)`, and round **only** at display. Missing nutrient data or missing gram-conversion data is reported in `completeness`, never zero-filled.
- **Rationale**: Full precision + display-only rounding prevents the compounding error the prototype shows in weekly aggregation (F-20); absolute mass aggregates correctly across ingredients (the user's micronutrient-units choice); completeness flags satisfy the accuracy intent of FR-4/NFR-3 instead of understating. Purity makes it trivially testable (F-18) and shareable (AD-1).
- **Alternatives Considered**: Port the prototype's in-loop rounding + zero-fill — rejected as a direct NFR-3 violation. %DV aggregation — rejected because %DV does not sum reliably across differing reference amounts.

### AD-4: Hybrid Postgres schema (macros as columns, micronutrients as JSONB) with Drizzle ORM + SQL migrations

- **Context**: Nutrition has a fixed, always-present macro set and a sparse, open-ended (~40-value) micronutrient set; the user wants a normalized, space-efficient Postgres store.
- **Decision**: We will store macros (calories, protein_g, carbs_g, fat_g, fiber_g) as `NUMERIC` columns and micronutrients as a single `JSONB` column (absolute mass), normalized everywhere to a `reference_grams` basis (default 100). We will access Postgres via **Drizzle ORM** with `drizzle-kit` SQL migrations.
- **Rationale**: Hybrid columns+JSONB is the documented best practice for sparse attributes and beats EAV on every axis (F-9); micronutrients are display-only and never filtered, so JSONB's weaker aggregation is acceptable. Drizzle is TS-first and lightweight (no heavy query-engine binary like Prisma), keeps the schema explicit, and fits AD-1/AD-2.
- **Alternatives Considered**: Fully relational nutrient rows (EAV) — rejected (join overhead, scatters hot macros). JSONB-blob documents — rejected (loses FK integrity for tags/plan references). Prisma — heavier runtime; Kysely + node-pg-migrate is a viable lighter-typed alternative if Drizzle proves limiting.

### AD-5: Auth-ready single workspace via `workspace_id` FK + one seeded default workspace

- **Context**: MVP is a single global shared workspace, but NFR-4/AC-11.4 require adding per-user auth later without restructuring data.
- **Decision**: We will add a `workspace_id UUID NOT NULL` FK (→ `workspaces`) to every owned table (ingredients, recipes, tags, plan_entries) and seed exactly one default workspace row now. The API resolves a single hard-coded workspace id until auth exists.
- **Rationale**: Shared-schema multi-tenancy with a tenant FK is the standard pattern (F-10); seeding one workspace means future auth is purely additive (add `users`, membership, optional RLS) with no backfill or constraint tightening — strictly better than a nullable owner column.
- **Alternatives Considered**: No tenancy column now (add later) — rejected: forces a backfill + NOT NULL tightening migration across all data. Nullable `owner_id` — rejected: weaker integrity, still needs tightening later.

### AD-6: Identify a week by `week_start_date` (the Monday's DATE)

- **Context**: FR-9 needs reliable week navigation/history. The prototype's `YYYY-Www` string is not ISO-compliant and breaks at year boundaries (F-11).
- **Decision**: We will store `week_start_date DATE` (the Monday) on plan entries, computed server-side, and range-query it for navigation/history.
- **Rationale**: A Monday DATE is unambiguous, timezone-independent, sortable, and range-queryable, sidestepping ISO 53-week/year-boundary bugs (F-11).
- **Alternatives Considered**: ISO `YYYY-Www` string (prototype) — rejected (demonstrated boundary bug). Storing isoyear+isoweek integers — viable but DATE is simpler to range-query.

### AD-7: USDA integration via a server-side proxy + Postgres cache-aside

- **Context**: The USDA key is a query param (must stay server-side, NFR-4); the free tier is 1000 req/hr (NFR-5); the app must degrade gracefully (NFR-7).
- **Decision**: We will expose backend endpoints (`/ingredients/search`, `/ingredients/usda/:fdcId`) that call USDA with the env-var key, query `Foundation`+`SR Legacy` first (Branded as a fallback tier), normalize both the flat (search) and nested (detail) nutrient shapes by stable nutrient **number**, and cache responses **cache-aside in a Postgres `usda_food_cache` table**. On USDA timeout/429/5xx we serve stale cache if present, else return a clear error that the UI uses to steer the user to custom entry. Missing nutrients are treated as unknown, not zero.
- **Rationale**: A proxy is the only way to keep the key off the client (F-14); Postgres cache-aside respects the rate limit and doubles as the degradation store with no extra service (F-17); Foundation/SR give complete per-100g data (F-16); mapping by number is robust across dataTypes (F-15).
- **Alternatives Considered**: Bulk-download FDC datasets into Postgres — eliminates rate-limit risk but Branded is huge and conflicts with space efficiency; viable later, overkill for MVP. Redis cache — rejected (extra stateful container, volatile, no durable fallback).

### AD-8: Per-ingredient gram-equivalents with confirm-at-entry; snapshot nutrition at add-time

- **Context**: Volume→gram conversion is density-dependent and USDA gives no density (F-19); recipes must stay stable as the USDA cache changes (F-13).
- **Decision**: We will store a per-ingredient `gram_weight_per_qty` and per-ingredient volume gram-equivalents (seeded from USDA portion data where available); at entry the UI pre-fills the computed grams and lets the user confirm/override. When an ingredient is added from USDA, its per-100g nutrition is **snapshotted into the owned `ingredients` row**; `usda_food_cache` remains a pure lookup accelerator.
- **Rationale**: Per-ingredient gram-equivalents + user confirmation is the most accurate path (F-19) and flags ingredients lacking density data instead of silently estimating; snapshotting protects historical recipe accuracy from cache eviction (F-13).
- **Alternatives Considered**: Global fixed volume factors (prototype) — rejected (~2× error, NFR-3 breach). Grams/qty only for MVP — viable and simplest but less convenient; rejected per user choice. Reference recipes directly to the USDA cache — rejected (eviction would rewrite history).

### AD-9: Drag-and-drop via dnd-kit with touch activation + tap-to-assign fallback

- **Context**: FR-10/AC-10.4 require drag-and-drop that works on touch; the prototype's HTML5 DnD does not fire on touch (F-2); the two-panel edit view must collapse on mobile (NFR-2).
- **Decision**: We will use dnd-kit (`useDraggable`/`useDroppable` + a PointerSensor with a touch activation delay and a mouse distance threshold, plus a keyboard sensor), and provide a **tap-to-assign** fallback on mobile so touch users aren't forced into a fiddly drag. The edit layout is a CSS two-column (≥768px) that collapses to a single column with the recipe palette as a drawer.
- **Rationale**: dnd-kit gives unified mouse/touch/keyboard with WCAG-aligned a11y and GPU-transform performance (F-3), directly satisfying AC-10.4 and NFR-2; the tap fallback de-risks the known mobile drag-vs-scroll problem.
- **Alternatives Considered**: react-dnd with HTML5+touch backends — viable but needs backend-switching and weaker a11y. Native HTML5 DnD (prototype) — rejected (no touch). JS-driven layout switching — rejected in favor of pure CSS.

### AD-10: Client server-state via TanStack Query, keyed by week

- **Context**: The app has many async reads (recipe list, per-week plans, search) and writes (CRUD, planner edits) needing consistent loading/error handling and snappy week navigation (NFR-1).
- **Decision**: We will manage server state with TanStack Query — `useQuery` for recipes/recipe-by-id/week-plan-by-week-start-date and search; `useMutation` + `invalidateQueries`/`setQueryData` for writes; plan queries keyed by `week_start_date`.
- **Rationale**: Automatic caching/dedup/retry/loading/error and week-keyed caching make navigation instant with little custom code (F-4), supporting NFR-1 and the error-surfacing ACs (AC-1.6/7.6/9.4/11.5).
- **Alternatives Considered**: Plain fetch + Context — viable, zero deps, but re-implements caching/loading/error per surface and has no week cache; rejected for the volume of async flows.

### AD-11: Frontend as a static Vite build served by nginx, with runtime env injection

- **Context**: Deploy call-out 1 requires config via env vars at runtime, but a Vite build bakes `import.meta.env` at build time (F-5); the frontend must hold no secrets.
- **Decision**: We will multi-stage build the SPA (`vite build` → nginx), and at container start render `env-config.js` (`window._env_ = { API_BASE_URL }`) from environment variables via an envsubst entrypoint; the API client reads `window._env_.API_BASE_URL`. nginx adds SPA history fallback. `env-config.js` is served `no-cache`. No secret (e.g. the USDA key) ever reaches the bundle — it stays in the API.
- **Rationale**: One immutable image promotes across environments with runtime config (F-5), satisfying call-out 1 and NFR-4.
- **Alternatives Considered**: Build-per-environment with `VITE_` vars — rejected (not one image, risks baking config). Serving the SPA from the Fastify app — viable (2 services instead of 3) but couples web/api lifecycles; nginx is a better static server.

### AD-12: Docker Compose topology (web + api + postgres) with runtime-only secrets

- **Context**: Deploy call-outs 1+2 require both FE and BE as Docker images with secrets only as env vars; NFR-6 wants a simple repeatable deploy and health checks.
- **Decision**: We will define three Compose services — `web` (nginx, AD-11), `api` (Fastify), `postgres` — all multi-stage built. Secrets (DB creds, `USDA_API_KEY`) come from Compose `environment:`/`env_file:` (a gitignored host `.env`), never build `ARG`. `postgres` has a `pg_isready` healthcheck; `api` `depends_on` it `service_healthy`. The API exposes `/healthz` and logs structured JSON via pino.
- **Rationale**: Compose env/env_file are runtime and stay out of image layers (F-7), satisfying NFR-4; healthcheck gating and structured logs satisfy NFR-6.
- **Alternatives Considered**: Docker secrets / external secret manager — heavier than needed for a personal deploy; env vars suffice and match the user's request. Build ARG for config — rejected (bakes into layers).

## Resolved Uncertainties

> Question and answer only — supporting evidence is in `references/research.md`.

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 1 | Does the prototype's drag-and-drop work on touch? | No — it uses HTML5 DnD which doesn't fire on touch; rebuild on dnd-kit (AD-9). | F-2; research.md Aspect 1 |
| 2 | Which DnD library supports mouse + touch + keyboard? | dnd-kit, via PointerSensor activation constraints + keyboard sensor. | F-3; research.md Aspect 1 |
| 3 | How does a static Vite image get its API URL at runtime? | envsubst entrypoint renders `window._env_`; app reads it at startup (AD-11). | F-5; research.md Aspect 1 |
| 4 | Smallest vs most-shareable backend? | Go is smallest (~15MB) but TS (Fastify) lets the engine be shared once — TS chosen (AD-2). | F-6; research.md Aspect 2 |
| 5 | JSONB vs relational for micronutrients? | Macros as columns, micronutrients as JSONB absolute mass; EAV rejected (AD-4). | F-9; research.md Aspect 3 |
| 6 | How to be auth-ready without a later restructure? | `workspace_id` NOT NULL FK on every owned table + one seeded workspace (AD-5). | F-10; research.md Aspect 3 |
| 7 | How to identify a week reliably? | Store the Monday's DATE, computed server-side; not an ISO week string (AD-6). | F-11; research.md Aspect 3 |
| 8 | USDA rate limit and key handling? | 1000 req/hr free tier; key is a query param → server-side proxy + Postgres cache (AD-7). | F-14; research.md Aspect 4 |
| 9 | Which USDA dataTypes for reliable per-100g data? | Foundation + SR Legacy first; Branded as fallback; missing nutrients = unknown (AD-7). | F-16; research.md Aspect 4 |
| 10 | Is fixed water-equivalent volume conversion accurate enough? | No (~2× off for flour); use per-ingredient gram-equivalents + confirm (AD-8). | F-19; research.md Aspect 5 |
| 11 | Where should the nutrition engine live? | A pure shared TS module used by web + api (AD-1, AD-3). | F-18; research.md Aspect 5 |
| 12 | How to handle missing nutrient data? | Flag incompleteness in a completeness descriptor; never zero-fill (AD-3). | F-20; research.md Aspect 5 |

## Standards

> Top standards most relevant to this design. The complete inventory is in `references/standards.md`.

| ID | Rule | Domain | File Type | Action Type | Source |
| --- | --- | --- | --- | --- | --- |
| S-1 | Secrets (DB creds, USDA key) come only from runtime env vars; never hardcoded or in build ARG | security | * | * | design constraint (deploy call-outs 1+2, NFR-4) |
| S-2 | Run lint before committing TypeScript/JavaScript | other | .ts, .tsx | * | global CLAUDE.md (Code Change Workflow) |
| S-3 | Validate all API inputs/outputs at the boundary with shared Zod schemas | api-design | .ts | create | design decision (AD-1, AD-2) |
| S-4 | Use parameterized queries / ORM bindings; never string-concatenate SQL | security | .ts, .sql | * | design constraint (AD-4) |
| S-5 | Nutrition-engine code is pure and dependency-free; unit-tested first (TDD) | testing | .ts | create | design decision (AD-1, AD-3) + NFR-3 + user election |
| S-6 | No emojis in code, comments, commit messages, or UI copy | other | * | * | global CLAUDE.md (Behavior & Communication) |

## File Inventory

> Best-effort; the task skill refines this. Monorepo paths are repo-relative.

| Action | Path | Related FRs | Rationale |
| --- | --- | --- | --- |
| create | package.json | — | Root npm-workspaces manifest (AD-1) |
| create | tsconfig.base.json | — | Shared TS config |
| create | packages/shared/src/types.ts | FR-1,2,3,7,11 | Domain types (Recipe, Ingredient, PlanEntry, Nutrition) |
| create | packages/shared/src/schemas.ts | FR-1,2,3,7 | Zod request/response schemas (S-3) |
| create | packages/nutrition-engine/src/units.ts | FR-4 | Unit table + per-ingredient gram resolution (AD-8) |
| create | packages/nutrition-engine/src/compute.ts | FR-4,12 | Pure computeRecipeNutrition (AD-3) |
| create | packages/nutrition-engine/src/compute.test.ts | FR-4, NFR-3 | TDD unit tests, hand-verified recipes (S-5) |
| create | apps/api/src/server.ts | FR-11 | Fastify bootstrap, pino, /healthz (AD-2, AD-12) |
| create | apps/api/src/config/env.ts | NFR-4 | Env var loading (DB, USDA_API_KEY) (S-1) |
| create | apps/api/src/db/schema.ts | FR-1,7,11 | Drizzle schema (AD-4) |
| create | apps/api/src/db/migrations/0001_init.sql | FR-11, NFR-4 | Initial schema + seed default workspace + units (AD-4,5) |
| create | apps/api/src/routes/recipes.ts | FR-1,5,6 | Recipe CRUD, tags, filter, search |
| create | apps/api/src/routes/ingredients.ts | FR-2,3 | USDA search/lookup proxy + custom ingredients (AD-7) |
| create | apps/api/src/routes/plans.ts | FR-7,8,9 | Weekly plan CRUD, week-range history (AD-6) |
| create | apps/api/src/usda/client.ts | FR-2, NFR-5,7 | USDA fetch + nutrient-number mapping + cache-aside (AD-7) |
| create | apps/web/src/main.tsx | — | React entry; reads window._env_ (AD-11) |
| create | apps/web/src/router.tsx | FR-9 | React Router; week encoded in URL (agent decision) |
| create | apps/web/src/api/client.ts | FR-11 | Fetch wrapper to API_BASE_URL |
| create | apps/web/src/query/hooks.ts | FR-1,7,9 | TanStack Query hooks, week-keyed (AD-10) |
| create | apps/web/src/views/MealLibrary.tsx | FR-1,5,6 | Library view (port from prototype) |
| create | apps/web/src/views/WeeklyPlanner.tsx | FR-7,8,9,10 | Planner + dnd-kit edit mode (AD-9) |
| create | apps/web/Dockerfile | deploy | Multi-stage Vite→nginx (AD-11) |
| create | apps/web/docker-entrypoint.sh | NFR-4 | envsubst window._env_ at start (AD-11) |
| create | apps/web/nginx.conf | deploy | SPA fallback, no-cache env-config.js |
| create | apps/api/Dockerfile | deploy | Multi-stage Node build (AD-2,12) |
| create | docker-compose.yml | deploy, NFR-6 | web+api+postgres, healthcheck, env_file (AD-12) |
| create | .env.example | NFR-4 | Documents required env vars (no real secrets) |
| create | .gitignore | NFR-4 | Ignore .env (S-1) |
| create | .dockerignore | deploy | Keep build context lean |

## Dependencies and Coupling

| Feature Area | Shared Files | Recommendation |
| --- | --- | --- |
| FR-4, FR-12 (nutrition) | `packages/nutrition-engine/*` | Build the engine first as a standalone TDD package (S-5); both web and api depend on it. It is the natural walking-skeleton seed. |
| All FRs (contract) | `packages/shared/*` | Define domain types + Zod schemas early; web and api both import them. Changes here ripple to both apps. |
| FR-1,2,3,4,7,11 (persistence) | `apps/api/src/db/schema.ts`, `migrations/0001_init.sql` | Hoist the full schema + seed (workspace, units) into the first migration; recipes, ingredients, tags, plans all depend on it. |
| FR-2, FR-3, FR-4 (ingredients) | `apps/api/src/usda/client.ts`, `ingredients.ts` | USDA proxy, custom ingredients, and the snapshot-at-add behavior (AD-8) are tightly coupled — implement together. |
| FR-7,8,9,10 (planner) | `apps/web/src/views/WeeklyPlanner.tsx` | Week navigation, detail view, and dnd-kit edit mode share state; sequence after recipes (FR-7 depends on FR-1) per spec dependencies. |

## Spec Deviations

| Spec Value | Location | Design Value | Rationale |
| --- | --- | --- | --- |
| "vitamins/minerals" shown (unspecified unit) | AC-4.2, FR-4 | Stored/aggregated as absolute mass (mg/mcg); %DV optional display | USDA returns absolute mass; %DV does not aggregate correctly across ingredients (AD-3, user choice). |
| Volume units implied to convert simply | AC-4.5, FR-4 | Per-ingredient gram-equivalents with user-confirmed grams at entry | Fixed factors are ~2× wrong for some foods, breaching NFR-3 (AD-8, F-19). |

All other spec values preserved.

## Open Questions

All spec Open Questions were resolved during the spec phase and are carried forward here with their confirmed status:

| Spec Resolved Question | Confirmed Answer | Realized in Design |
| --- | --- | --- |
| Which external nutrition API? | USDA FoodData Central | confirmed — AD-7 |
| How is the shared workspace identified before auth? | Single global shared workspace | confirmed — AD-5 |
| Does FR-12 aggregate vitamins/minerals or macros only? | Macros only | confirmed — AC-12.1, `contracts.md` `/plans/summary` |

No new blocking questions emerged from research. Non-blocking items deferred to implementation:
- The full enumerated list of vitamins/minerals to display (beyond the five macros) should be confirmed against a live Foundation-food response during implementation (F-15). Default: surface whatever micronutrients the dataType returns.
- The numeric rounding tolerance for NFR-3 unit tests (e.g. ±1 kcal, ±0.5 g) and the hand-verified test-recipe corpus to be fixed when the engine package is built (S-5).

## Constraints (Technical)

| Constraint | Category | Source | Rationale |
| --- | --- | --- | --- |
| USDA key supplied as an `?api_key=` query param → all USDA calls must be server-side | security | technical | The key would leak from any client call; forces the proxy (AD-7, F-14). |
| Vite bakes `import.meta.env` at build time | compatibility | technical | A single static image needs runtime injection for the API URL (AD-11, F-5). |
| USDA free tier ≈ 1000 req/hr per key | infrastructure | technical | Mandates caching and rate-limit backoff (AD-7, F-14). |
| Secrets only via runtime env vars; never build ARG | security | technical | Build ARG bakes into image layers (AD-12, F-7). |

## Assumptions

| Assumption | Source | Affects |
| --- | --- | --- |
| A ~150MB Node image is acceptable for this personal Docker deploy ("space efficient" = Postgres/data) | design | FR-11, NFR-5 |
| USDA Foundation+SR Legacy coverage is adequate for the household's ingredients; gaps filled by custom entry | research | FR-2, FR-3 |
| Per-ingredient gram-equivalents can be seeded from USDA portion data or curated defaults; otherwise flagged | design | FR-4, NFR-3 |
| Single-workspace data volumes are small enough that nutrition totals can be computed on read (no materialized cache) | design | FR-4, FR-12 |

## Risks (Technical)

| Risk | Impact | Probability | Mitigation | Affects |
| --- | --- | --- | --- | --- |
| Porting prototype DnD verbatim would silently ship a planner broken on touch | high | medium | Rebuild on dnd-kit; e2e test with touch emulation (AD-9, S-5) | FR-10 |
| Per-ingredient density/usual-weight data is incomplete, degrading accuracy | medium | medium | Confirm-at-entry override + completeness flags; never silent-estimate (AD-3, AD-8) | FR-4, NFR-3 |
| Cold cache / popular query bursts toward the 1000 req/hr limit, blocking the shared key for an hour | medium | low | Cache-aside + honor X-RateLimit-Remaining/429 backoff; serve stale on outage (AD-7) | FR-2, NFR-5,7 |
| Stale `env-config.js` cached by browser pins an old API URL | medium | low | Serve `env-config.js` with no-cache headers (AD-11) | NFR-4 |
| Treating missing USDA (branded) nutrients as zero would silently understate totals | high | medium | Map by nutrient number; treat missing as unknown; completeness flag (AD-3, AD-7) | FR-4, NFR-3 |
| Maintaining macros vs micronutrients on different code paths causes inconsistent handling of custom/partial ingredients | medium | low | Single engine treats macros and micros uniformly (AD-3) | FR-4 |

## References

- See `references/research.md` for full research results per aspect (5 aspects, 20 findings)
- See `references/standards.md` for the complete standards inventory (6 standards)
- See `references/contracts.md` for the REST API contract (resources + USDA proxy)
