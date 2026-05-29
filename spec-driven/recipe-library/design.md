---
slug: recipe-library
status: final
spec_source: spec-driven/recipe-library/spec.md
spec_tier: 1
spec_hash: sha256:dd66dd7b91bcadef918f1675f76aa5e16a45d2fec0877bbc0950e4f47b4a8a9d
adaptive_flow: rich-via-context
test_approach: tdd
test_capabilities:
  unit: null
  integration: null
  e2e: null
created_date: 2026-05-29
last_updated: 2026-05-29
---

# Architectural Design: recipe-library

## Overview

- **Spec**: Recipe Library & Nutrition — 6 FRs, 5 NFRs
- **Architecture**: new (greenfield) — builds on `platform-foundation`
- **Test approach**: tdd `[from program-wide election + NFR-3]`
- **Test capabilities**: unit=null, integration=null, e2e=null. **Recommended:** unit=**Vitest** (the nutrition engine is algorithmic and NFR-3-critical — TDD it first), integration=**Supertest** (recipe CRUD, USDA proxy, and custom-ingredient routes cross into Postgres), e2e=**Playwright** (deferred; the recipe create→nutrition flow is exercised at integration level here).

> Derived by partitioning the holistic `spec-driven/meal-tracking-mvp/design.md` (via `--context`) to the recipe/nutrition scope, building on the finalized `platform-foundation`. **[Context]**

## Technical Approach

Builds on `platform-foundation` (monorepo, `packages/shared`, Postgres + Drizzle baseline with seeded `workspaces`/`units`, Fastify skeleton + error envelope + workspace resolution, runtime-config frontend). This spec does **not** redefine those — it adds the nutrition engine package, recipe/ingredient/tag tables, the USDA proxy, and the Meal Library UI.

**Nutrition engine (AD-1, FR-4, NFR-3).** `packages/nutrition-engine` is a pure, dependency-free TypeScript module exposing `computeRecipeNutrition(ingredients, servings) -> { total, perServing, completeness }`. It converts each ingredient to grams (mass directly; volume via per-ingredient gram-equivalent; `qty` via per-ingredient usual-weight — AD-4), scales per-100g nutrient values, sums macros and the **absolute-mass** union of micronutrients in full float precision, divides by `max(servings,1)`, and rounds **only** at display. Missing nutrient/conversion data is reported in `completeness`, never zero-filled (F-5). It is imported by both the API (authoritative totals) and the web client (instant live recalc, AC-4.4). This package is built first via TDD — it is the accuracy core (NFR-3).

**Schema (AD-2, FR-1/3/5).** A feature migration on the platform baseline adds: `ingredients` (workspace-scoped; `source` usda|custom; nullable `fdc_id`; macro columns + `micronutrients JSONB`; `reference_grams` default 100; `gram_weight_per_qty`; per-unit gram-equivalents), `recipes` (workspace-scoped; name, meal_type, servings, notes, source_link), `recipe_ingredients` (join with quantity + `unit_code` FK→units, position), `tags` + `recipe_tags`, and `usda_food_cache` (keyed by `fdc_id`). Every owned table carries `workspace_id NOT NULL` per the platform convention (AD-2/platform AD-4).

**USDA integration (AD-3, FR-2, NFR-4/5/7).** The API exposes `/ingredients/search` and `/ingredients/usda/:fdcId` that call USDA FoodData Central with the env-var key (never client-side), querying Foundation+SR Legacy first (Branded fallback), normalizing both the flat (search) and nested (detail) nutrient shapes by stable nutrient **number** to one per-100g model. Responses are cached **cache-aside in `usda_food_cache`**, which also serves as the degradation store: on USDA timeout/429/5xx, serve stale cache if present, else return the shared error envelope so the UI steers to custom-ingredient entry (FR-3). Missing nutrients are treated as unknown, not zero (F-16).

**Volume & snapshot (AD-4, FR-2/3/4).** When an ingredient is added (USDA or custom), its per-100g nutrition is **snapshotted into the owned `ingredients` row** so cache eviction never rewrites historical recipes (F-13). Volume units resolve via per-ingredient gram-equivalents pre-filled at entry and **confirmed/overridable by the user** (F-19); ingredients lacking density data are flagged via `completeness`.

**Library UI (AD-5/AD-6, FR-1/5/6).** The Meal Library tab (filling the platform's placeholder view) does recipe CRUD, tag/meal-type filtering, and text search. Server state uses **TanStack Query** (AD-5); editing a recipe recomputes nutrition live in the browser via the shared engine (AC-4.4). Routes are Zod-validated against `packages/shared` schemas.

## Findings

> Summary table — full content in `references/research.md`. Partitioned from the holistic design.

| ID | Title | Source | Confidence | Related FRs | Summary |
| --- | --- | --- | --- | --- | --- |
| F-1 | Prototype is React; components/math port directly | codebase | high | FR-1,5,6, NFR-2 | React + the prototype's recipe/ingredient UI and calc logic port into a responsive (mobile + desktop) library UI. |
| F-2 | TanStack Query handles async reads/writes cleanly | web_research | high | FR-1,5,6 | Caching/dedup/retry/loading/error for recipe list, search, and CRUD mutations. |
| F-3 | Pure engine is extractable and shareable | codebase | high | FR-4, NFR-3 | The calc logic is dependency-free → one unit-tested module used by web + api. |
| F-4 | Fixed water-equivalent volume is ~2x off for flour | web_research | high | FR-4, NFR-3 | Per-ingredient gram-equivalents required; fixed factors breach NFR-3. |
| F-5 | Round at display; flag missing data, don't zero it | codebase | high | FR-4, NFR-3 | Full precision internally; completeness descriptor instead of silent zeros. |
| F-6 | USDA: api_key query param, 1000 req/hr, server-side | web_research | high | FR-2, NFR-4,5 | Key in URL forces a proxy; free tier demands caching + backoff. |
| F-7 | Search (flat) vs detail (nested) nutrient shapes | web_research | medium | FR-2,4 | Two parsers; map by stable nutrient number (208/203/204/205/291 + micros). |
| F-8 | Foundation+SR per-100g complete; Branded missing/per-serving | web_research | high | FR-2,4 | Query Foundation+SR first; treat missing branded nutrients as unknown. |
| F-9 | Postgres cache-aside doubles as degradation store | web_research | medium | FR-2, NFR-5 | Serve stale cache on USDA outage; no extra service. |
| F-10 | Hybrid schema (macro columns + micronutrient JSONB) | web_research | high | FR-1,3,4 | Macros as columns, micros as JSONB absolute mass; EAV rejected. |
| F-11 | Snapshot USDA nutrition into the ingredient at add-time | codebase | high | FR-2,4 | usda_food_cache is a pure accelerator; recipes reference a stable owned snapshot. |

## Architecture Decisions

### AD-1: Pure, shared, TDD nutrition-engine package

- **Context**: NFR-3 demands accurate, unit-tested nutrition; it's needed in the browser (live recalc, AC-4.4) and the API (authoritative totals, FR-12 in the planner spec). The prototype rounds mid-calc and zero-fills missing data (F-5).
- **Decision**: We will implement `packages/nutrition-engine` as a pure, dependency-free module exposing `computeRecipeNutrition(...) -> { total, perServing, completeness }`: per-100g scaling, full-precision accumulation, absolute-mass micronutrient union, round only at display, and a completeness descriptor for missing data. Both web and api import it. Build it first via TDD.
- **Rationale**: One implementation = one place to satisfy NFR-3 (F-3); display-only rounding avoids the prototype's compounding error (F-5); purity makes it trivially testable and shareable.
- **Alternatives Considered**: Reimplement per side (drift + double test surface); compute only server-side (loses instant browser recalc); keep the prototype's in-loop rounding/zero-fill (NFR-3 violation).

### AD-2: Recipe/ingredient/tag schema as a feature migration on the platform baseline

- **Context**: The library needs normalized storage for recipes, ingredients (USDA-cached + custom), and tags, on top of the platform's seeded `workspaces`/`units`.
- **Decision**: We will add a feature migration creating `ingredients` (macro columns + `micronutrients JSONB` absolute mass; `source`, nullable `fdc_id`, `reference_grams`, `gram_weight_per_qty`, per-unit gram-equivalents), `recipes`, `recipe_ingredients` (FK→units), `tags`, `recipe_tags`, and `usda_food_cache`. Every owned table carries `workspace_id NOT NULL` (platform convention).
- **Rationale**: Hybrid columns+JSONB is best for sparse, display-only micronutrients (F-10); building on the platform baseline avoids redefining workspaces/units.
- **Alternatives Considered**: EAV nutrient rows (join overhead, scatters hot macros); JSONB-blob recipes (loses FK integrity for tags/ingredient references).

### AD-3: USDA proxy with Postgres cache-aside and graceful degradation

- **Context**: The USDA key must stay server-side (NFR-4); free tier is 1000 req/hr (NFR-4 cost); the app must degrade gracefully (NFR-5).
- **Decision**: We will expose `/ingredients/search` and `/ingredients/usda/:fdcId` that call USDA with the env-var key, query Foundation+SR Legacy first (Branded fallback), normalize both nutrient shapes by stable nutrient number, and cache-aside in `usda_food_cache`. On USDA failure: serve stale cache if present, else return the shared error envelope (UI → custom entry). Missing nutrients = unknown.
- **Rationale**: A proxy is the only way to hide the key (F-6); Postgres cache-aside respects the rate limit and is the degradation store (F-9); Foundation+SR give complete per-100g data (F-8); number-keyed mapping is robust (F-7).
- **Alternatives Considered**: Bulk-download FDC datasets (Branded huge, conflicts with space); Redis cache (extra volatile service); client-side USDA calls (leaks the key).

### AD-4: Per-ingredient gram-equivalents with confirm-at-entry; snapshot nutrition at add-time

- **Context**: Volume→gram conversion is density-dependent and USDA gives no density (F-4); recipes must stay stable as the cache changes (F-11).
- **Decision**: We will store per-ingredient `gram_weight_per_qty` and per-unit gram-equivalents (seeded from USDA portion data where available); at entry the UI pre-fills the computed grams and lets the user confirm/override. Adding an ingredient snapshots its per-100g nutrition into the owned `ingredients` row; `usda_food_cache` stays a pure accelerator.
- **Rationale**: Per-ingredient + confirm is the most accurate path and flags gaps instead of silently estimating (F-4); snapshotting protects historical recipe accuracy (F-11).
- **Alternatives Considered**: Global fixed volume factors (~2× error, NFR-3 breach); grams/qty-only MVP (less convenient — rejected by the spec); reference recipes directly to the cache (eviction rewrites history).

### AD-5: Library UI server state via TanStack Query; live nutrition via the shared engine

- **Context**: The library has many async reads (list, search) and writes (CRUD) needing consistent loading/error handling; editing must show nutrition update instantly (AC-4.4).
- **Decision**: We will use TanStack Query for recipe/tag/ingredient queries + mutations (invalidate on write), and call the shared `nutrition-engine` in the recipe editor to recompute nutrition live as ingredients/quantities/servings change. The Meal Library views are built responsive (phone + desktop) with WCAG 2.1 AA basics (NFR-2).
- **Rationale**: Automatic caching/loading/error with little code (F-2); the shared engine gives instant, authoritative-consistent recalc (AD-1, AC-4.4); a responsive React layout satisfies NFR-2 (F-1).
- **Alternatives Considered**: Plain fetch + Context (re-implements caching/error per surface); server round-trip per keystroke for nutrition (laggy, defeats instant recalc).

### AD-6: Filtering and search as server-side query parameters

- **Context**: FR-5/FR-6 require tag + meal-type filtering and text search over the library.
- **Decision**: We will implement filtering/search as query params on `GET /recipes` (`q`, `mealType`, `tag`), executed as parameterized Drizzle queries; the UI drives them via TanStack Query keys.
- **Rationale**: Server-side filtering scales beyond an in-memory list and keys naturally into the query cache (F-2); parameterized queries satisfy S-4.
- **Alternatives Considered**: Client-side filtering of a full recipe dump (doesn't scale, re-fetches everything); a search engine/extension (overkill for MVP — Postgres `ILIKE`/trigram suffices).

## Resolved Uncertainties

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 1 | Where does the nutrition engine live? | A pure shared TS package used by web + api | F-3; AD-1 |
| 2 | How accurate must volume conversion be? | Per-ingredient gram-equivalents + confirm; not fixed factors | F-4; AD-4 |
| 3 | How to handle missing nutrient data? | Flag in a completeness descriptor; never zero-fill | F-5; AD-1 |
| 4 | How is the USDA key protected + rate limit respected? | Server-side proxy + Postgres cache-aside; serve stale on outage | F-6, F-9; AD-3 |
| 5 | Which USDA dataTypes? | Foundation+SR Legacy first, Branded fallback; map by number | F-7, F-8; AD-3 |
| 6 | How do recipes stay stable as the cache changes? | Snapshot per-100g nutrition into the owned ingredient at add-time | F-11; AD-4 |
| 7 | Macros vs micronutrient storage? | Macro columns + micronutrient JSONB (absolute mass) | F-10; AD-2 |

## Standards

> Full inventory in `references/standards.md`.

| ID | Rule | Domain | File Type | Action Type | Source |
| --- | --- | --- | --- | --- | --- |
| S-1 | Nutrition-engine code is pure, dependency-free, unit-tested first (TDD) | testing | .ts | create | AD-1 + NFR-3 |
| S-2 | USDA API key only from runtime env; never client-side or in build ARG | security | * | * | NFR-4 (platform S-1) |
| S-3 | Validate API inputs/outputs with shared Zod schemas | api-design | .ts | create | platform AD-1/AD-2 |
| S-4 | Use Drizzle/parameterized queries; never concatenate SQL | security | .ts, .sql | * | platform AD-3 |
| S-5 | Schema changes go through versioned drizzle-kit migrations on the platform baseline | other | .sql, .ts | create | platform AD-3 |
| S-6 | Round nutrition only at display; never zero-fill missing data | other | .ts, .tsx | create | AD-1, F-5 |
| S-7 | No emojis | other | * | * | global CLAUDE.md |

## File Inventory

| Action | Path | Related FRs | Rationale |
| --- | --- | --- | --- |
| create | packages/nutrition-engine/src/units.ts | FR-4 | Per-ingredient gram resolution (AD-4) |
| create | packages/nutrition-engine/src/compute.ts | FR-4 | Pure computeRecipeNutrition (AD-1) |
| create | packages/nutrition-engine/src/compute.test.ts | FR-4, NFR-3 | TDD unit tests, hand-verified recipes (S-1) |
| modify | packages/shared/src/types.ts | FR-1,2,3 | Recipe/Ingredient/Nutrition types |
| modify | packages/shared/src/schemas.ts | FR-1,2,3 | Zod schemas for recipe/ingredient payloads (S-3) |
| create | apps/api/drizzle/0002_recipe_library.sql | FR-1,3,5 | Feature migration: ingredients, recipes, recipe_ingredients, tags, recipe_tags, usda_food_cache (AD-2) |
| modify | apps/api/src/db/schema.ts | FR-1,3,5 | Drizzle models for the new tables |
| create | apps/api/src/usda/client.ts | FR-2, NFR-5,7 | USDA fetch + nutrient-number mapping + cache-aside (AD-3) |
| create | apps/api/src/routes/ingredients.ts | FR-2,3 | USDA search/lookup proxy + custom ingredient CRUD (AD-3,4) |
| create | apps/api/src/routes/recipes.ts | FR-1,5,6 | Recipe CRUD + filter/search (AD-6) |
| create | apps/api/src/routes/tags.ts | FR-5 | Tag list/create |
| modify | apps/api/src/server.ts | FR-1,2,5 | Register recipe/ingredient/tag routes |
| create | apps/web/src/views/MealLibrary.tsx | FR-1,5,6 | Library view (port from prototype) (AD-5) |
| create | apps/web/src/components/RecipeEditor.tsx | FR-1,4 | Recipe form with live nutrition via shared engine (AC-4.4) |
| create | apps/web/src/components/IngredientPicker.tsx | FR-2,3 | USDA search + custom entry + gram confirm (AD-4) |
| create | apps/web/src/query/recipes.ts | FR-1,5,6 | TanStack Query hooks (AD-5) |

## Dependencies and Coupling

| Feature Area | Shared Files | Recommendation |
| --- | --- | --- |
| FR-4 (engine) | `packages/nutrition-engine/*` | Build first via TDD (S-1); web and api both import it. The walking-skeleton seed for this spec. |
| FR-1,2,3 (contract) | `packages/shared/*` | Extend shared types + Zod for recipe/ingredient payloads before routes/UI; both apps import them. |
| FR-1,2,3,5 (schema) | `apps/api/drizzle/0002_recipe_library.sql`, `apps/api/src/db/schema.ts` | Land the feature migration (on platform baseline 0001) before routes; recipes/ingredients/tags depend on it. |
| FR-2,3 (ingredients) | `apps/api/src/usda/client.ts`, `routes/ingredients.ts` | USDA proxy, custom ingredients, and snapshot-at-add (AD-4) are tightly coupled — implement together. |
| FR-1,5,6 (UI) | `apps/web/src/views/MealLibrary.tsx`, `query/recipes.ts` | UI depends on routes + the shared engine; sequence after API + engine. |

> Upstream dependency: `platform-foundation` (monorepo, shared package, DB baseline + units, server skeleton, workspace resolution) must be in place. Downstream: `weekly-planner` references recipes (FR-1) and the recipe list/filters (FR-5) from this spec.

## Spec Deviations

| Spec Value | Location | Design Value | Rationale |
| --- | --- | --- | --- |
| "vitamins/minerals" shown (unspecified unit) | AC-4.2 | Stored/aggregated as absolute mass (mg/mcg); %DV optional display | USDA returns absolute mass; %DV doesn't aggregate across ingredients (AD-1, program decision) |
| Volume units implied to convert simply | AC-4.5 | Per-ingredient gram-equivalents with user-confirmed grams at entry | Fixed factors are ~2× wrong for some foods, breaching NFR-3 (AD-4, F-4) |

All other spec values preserved.

## Open Questions

Resolved upstream: USDA FoodData Central as the source; micronutrients as absolute mass. Non-blocking, deferred to implementation:
- The exact enumerated vitamin/mineral list to display beyond the five macros — confirm against a live Foundation response (F-7).
- The NFR-3 rounding tolerance and the hand-verified test-recipe corpus — to be set when building the engine (S-1). The values ±1 kcal / ±0.5 g are illustrative only, not binding design values.

## Constraints (Technical)

| Constraint | Category | Source | Rationale |
| --- | --- | --- | --- |
| USDA key supplied as `?api_key=` → all USDA calls server-side | security | technical | Key would leak from any client call (AD-3, F-6) |
| USDA free tier ≈ 1000 req/hr | infrastructure | technical | Mandates caching + backoff (AD-3, F-6) |
| Nutrition accuracy takes precedence over calc speed | performance | technical | No latency cap on the engine; correctness first (NFR-1/NFR-3) |
| Builds on platform-foundation; must not redefine workspaces/units/baseline | infrastructure | technical | Feature migration extends baseline 0001 (AD-2) |

## Assumptions

| Assumption | Source | Affects |
| --- | --- | --- |
| USDA Foundation+SR Legacy coverage is adequate; gaps filled by custom entry | research | FR-2, FR-3 |
| Per-ingredient gram-equivalents can be seeded from USDA portion data or curated defaults; otherwise flagged | design | FR-4, NFR-3 |
| Single-workspace volumes are small enough to compute nutrition on read (no materialized cache) | design | FR-4 |
| Postgres ILIKE/trigram is sufficient for FR-6 text search at MVP scale | design | FR-6 |

## Risks (Technical)

| Risk | Impact | Probability | Mitigation | Affects |
| --- | --- | --- | --- | --- |
| Per-ingredient density/usual-weight data incomplete, degrading accuracy | medium | medium | Confirm-at-entry override + completeness flags; never silent-estimate (AD-1, AD-4) | FR-4, NFR-3 |
| Cold cache / popular query bursts toward 1000 req/hr, blocking the key | medium | low | Cache-aside + honor X-RateLimit/429 backoff; serve stale on outage (AD-3) | FR-2, NFR-4, NFR-5 |
| Treating missing USDA (branded) nutrients as zero understates totals | high | medium | Map by nutrient number; treat missing as unknown; completeness flag (AD-1, AD-3) | FR-4, NFR-3 |
| Macros vs micronutrients handled on different code paths cause inconsistent partial-ingredient handling | medium | low | Single engine treats macros and micros uniformly (AD-1) | FR-4 |

## References

- See `references/research.md` for full findings (partitioned from the holistic design)
- See `references/standards.md` for the complete standards inventory
- See `references/contracts.md` for the recipe/ingredient/tag REST contract
