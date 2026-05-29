# Research Results: meal-tracking-mvp

Greenfield project. Five aspects investigated by parallel research subagents. The only existing code is a reference-only React prototype (`artifacts/food-tracker.jsx`).

---

## Aspect 1 — Frontend architecture for a mobile-friendly meal-tracking SPA

### Findings

#### F-1: Prototype is React; components and nutrition math port directly
- **Source**: codebase
- **Confidence**: high
- **Related**: FR-1, FR-5, FR-6, FR-7, FR-8, FR-9, FR-12
- **Files**: `artifacts/food-tracker.jsx`

The prototype is a single-file React app (hooks: useState/useEffect/useRef/useMemo/useCallback) with two top-level views (MealLibrary, WeeklyPlanner), three modals (RecipeModal, AddMealModal, MealDetailModal), client-computed nutrition (`calcRecipeNutrition`), and client-side filter/search/tag state. Choosing React lets the component structure, state shape, and nutrition math be ported with minimal rework; a non-React framework would mean a full rewrite of working logic.

#### F-2: Prototype drag-and-drop is native HTML5 — fails on touch
- **Source**: codebase
- **Confidence**: high
- **Related**: FR-10
- **Files**: `artifacts/food-tracker.jsx`

WeeklyPlanner uses `draggable` + `onDragStart`/`e.dataTransfer.setData('recipeId')` + `onDrop`. The HTML5 Drag-and-Drop API does not fire on `touchstart`/`touchmove`, so AC-10.4 (touch drag) cannot be met by porting it as-is. The DnD layer must be rebuilt.

#### F-3: dnd-kit unifies mouse/touch/keyboard
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-10, NFR-1, NFR-2
- **Files**: —

dnd-kit supports mouse, touch, pen, and keyboard via the Pointer Events API; current versions consolidate sensors into a PointerSensor with composable activation constraints (Distance for mouse, Delay for touch so a press-and-hold starts a drag without hijacking scroll). It ships keyboard sensor support and screen-reader announcements aligned with WCAG 2.1 AA, and uses GPU-accelerated CSS transforms for 60fps. Directly satisfies AC-10.4 and helps NFR-2.

#### F-4: TanStack Query handles the async matrix and week caching
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-1, FR-5, FR-6, FR-7, FR-9, FR-12
- **Files**: —

TanStack Query manages caching, dedup, retries, background refetch, and loading/error states; mutations pair with `invalidateQueries`/`setQueryData`. The app has many async reads (recipe list, per-week plans, week navigation) and writes (CRUD, planner edits); week-keyed queries make navigation instant from cache. Plain fetch + effects would hand-roll all of this.

#### F-5: Vite bakes env at build time; runtime injection required
- **Source**: web_research
- **Confidence**: high
- **Related**: NFR-4
- **Files**: —

A static SPA build bakes `import.meta.env` at build time, so one image can't be repointed per environment via plain `VITE_` vars. The established pattern is a container entrypoint that `envsubst`-renders an `env-config.js` (`window._env_ = { API_BASE_URL }`) from env vars before nginx serves the assets; the app reads `window._env_` at startup. No secret reaches the bundle.

### Approaches Evaluated

**Preferred: React + Vite + TypeScript.** Reuse the prototype's components and `calcRecipeNutrition`; Vite gives fast HMR and an optimized static build for nginx. Tradeoffs: near-direct reuse, huge ecosystem (dnd-kit, TanStack Query, Router), excellent AI tooling; SPA needs runtime-env and history fallback handled explicitly. References: `artifacts/food-tracker.jsx`, https://vitejs.dev/guide/, https://react.dev/

**Not recommended: Next.js / SvelteKit / SolidStart.** SSR/file-routing add nothing for a single-workspace authenticated SPA and discard the React prototype. References: https://nextjs.org/docs, https://svelte.dev/docs/kit

**Preferred: dnd-kit (PointerSensor + touch activation).** Recipe cards `useDraggable`, day/slot targets `useDroppable`, within a DndContext; touch Delay + mouse Distance constraints; optional KeyboardSensor. Tradeoffs: first-class touch+mouse+keyboard and a11y; learning curve around sensors/collision; touch delay must be tuned vs scroll. References: https://github.com/clauderic/dnd-kit, https://dndkit.com/

**Viable: react-dnd with HTML5 + Touch backends.** Works but requires running/switching two backends and has weaker a11y. **Not recommended: native HTML5 DnD** (no touch — fails AC-10.4).

**Preferred: TanStack Query for server state.** **Viable: plain fetch + Context** (zero deps but re-implements caching/loading/error per surface; no week cache).

**Preferred: Containerization via multi-stage Vite→nginx with runtime env injection** (window._env_ + envsubst + SPA fallback). References: https://github.com/Dutchskull/Vite-Dynamic-Environment-Variables

**Preferred: Responsive two-panel planner via CSS Grid/Flex with a media-query collapse + mobile drawer + tap-to-assign fallback** for the recipe palette. References: `artifacts/food-tracker.jsx`, MDN CSS Grid.

### Resolved Uncertainties

| Question | Answer | Evidence |
| --- | --- | --- |
| Does prototype DnD work on touch? | No — HTML5 DnD doesn't fire on touch | food-tracker.jsx WeeklyPlanner; MDN HTML5 DnD docs |
| Which DnD lib supports mouse+touch? | dnd-kit, unified PointerSensor + activation constraints | dnd-kit docs, 2025 comparisons |
| Runtime API URL for a static Vite build? | envsubst entrypoint renders window._env_ | 2025 Vite/nginx runtime-injection guides |
| React or switch frameworks? | React + Vite + TS, to reuse the prototype | food-tracker.jsx is already React |

### Remaining Uncertainties
- Mobile planner UX detail: one-day-at-a-time vs stacked 7-day grid (tap-to-assign fallback recommended either way).
- Routing: React Router with week-in-URL (chosen) vs in-state tab switching.
- Whether ingredient search hits the backend live (debounced) — yes, via the USDA proxy (Aspect 4).
- Styling approach for the port (inline styles vs CSS modules) — not architecturally blocking.

---

## Aspect 2 — Backend, API & deployment

### Findings

#### F-6: Measured 2025-2026 image sizes
- **Source**: web_research
- **Confidence**: high
- **Related**: NFR-5
- **Files**: —

Go static binary on `gcr.io/distroless/static-debian13` ≈ 2-10MB (one real API: 9.34MB distroless vs 15.1MB Alpine vs 91.5MB slim). Node.js distroless ≈ 177MB, Node alpine ≈ 150MB. Python FastAPI under 100MB needs disciplined multi-stage slim/distroless builds. Go is ~15-90x smaller than Node and ~5-50x smaller than Python — but a ~150MB Node image is acceptable for a personal deploy, and the user's "space efficient" most plausibly targets the Postgres data store (used regardless).

#### F-7: Compose env/env_file are runtime; ARG bakes secrets
- **Source**: web_research
- **Confidence**: high
- **Related**: NFR-4
- **Files**: —

Docker Compose `environment:`/`env_file:` set container env vars at run time, interpolated from a host `.env` (gitignored), never copied into the image. Build `ARG`/`--build-arg` is the build-time mechanism and can be baked into layers, so it must not carry secrets. Reading DB creds and `USDA_API_KEY` from `process.env` at startup satisfies the constraint.

#### F-8: Fastify + pino + Zod is a small, AI-friendly Node stack
- **Source**: web_research
- **Confidence**: medium
- **Related**: FR-11, NFR-6
- **Files**: —

Fastify is lighter and faster than Express, ships pino structured logging (NFR-6), and pairs with Zod validation. With a shared TS engine (Aspect 5 / AD-1) the backend stays small in concept; node-pg-migrate/Drizzle handle migrations. (Go alternatives — chi+pgx+sqlc+golang-migrate+slog — were strong on size but lose engine sharing.)

### Approaches Evaluated

**Preferred (per user choice): Node + Fastify + TypeScript.** Shared engine/types with the frontend (AD-1), pino logs, Zod validation. Tradeoffs: ~150MB image (acceptable here), highest AI/ecosystem familiarity, type-shared with web. References: https://fastify.dev/, https://snyk.io/blog/choosing-the-best-node-js-docker-image/

**Viable (smaller, not chosen): Go + chi + pgx + sqlc on distroless.** ~10-20MB image, lowest memory, smallest attack surface. Rejected because the nutrition engine would not be shareable with the browser without a second implementation or a per-edit network round-trip. References: https://github.com/GoogleContainerTools/distroless, https://blog.logrocket.com/how-to-build-a-restful-api-with-docker-postgresql-and-go-chi/

**Viable: Python + FastAPI + asyncpg.** Readable, auto OpenAPI, Pydantic. Larger image than Go and same engine-sharing problem. The official tiangolo base image is deprecated, raising small-image effort. References: https://fastapi.tiangolo.com/deployment/docker/

### Resolved Uncertainties

| Question | Answer | Evidence |
| --- | --- | --- |
| Smallest vs most-shareable backend? | Go smallest, but TS chosen for one shared engine | F-6 sizes + AD-1 reasoning |
| Inject secrets without baking? | Runtime Compose env/env_file; never ARG | Docker Compose docs |
| DB access for space efficiency? | TS-first lightweight (Drizzle/Kysely), not Prisma | F-6; ORM engine-binary weight |
| Structured logging + health checks? | pino + GET /healthz; pg_isready gate | Fastify/pino docs; Compose healthcheck pattern |

### Remaining Uncertainties
- Where USDA responses cache: Postgres table (chosen, durable) vs in-process TTL (volatile).
- Whether web is served by the api image, a separate static container (chosen: nginx), or a CDN.

---

## Aspect 3 — Data model & workspace/ownership

### Findings

#### F-9: Hybrid columns + JSONB beats EAV for sparse nutrients
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-4
- **Files**: —

Postgres best practice for sparse, variable attribute sets is hybrid: fixed/hot/filterable fields as real columns, variable/rarely-filtered fields as JSONB; EAV is worse on every measurable axis. Macros (calories/protein/carbs/fat/fiber) are fixed and always present → columns; vitamins/minerals are sparse, open-ended (~40 possible, ~3-6 per ingredient), never filtered → JSONB. Avoids a 40-nullable-column table and EAV join overhead.

#### F-10: Shared-schema multi-tenancy with seeded default workspace = auth-ready
- **Source**: web_research
- **Confidence**: high
- **Related**: NFR-4, AC-11.4
- **Files**: —

A `workspace_id`/`tenant_id` FK on every owned table, pointing at a `workspaces` table, is the established pattern for apps that start single-tenant and add tenancy later. Seed one default workspace row now (fixed UUID). Adding users later is additive: create `users`, add nullable `user_id`/`created_by`, optionally enable RLS — no restructuring. A NOT NULL FK to a seeded workspace is strictly better than a nullable owner (no backfill, no constraint tightening).

#### F-11: Prototype week-key has an ISO/year-boundary bug
- **Source**: codebase
- **Confidence**: high
- **Related**: FR-9
- **Files**: `artifacts/food-tracker.jsx`

`getWeekKey()` builds `YYYY-Www` with a non-ISO formula (year from the navigated Monday, week from day-of-year/7), so late-Dec/early-Jan weeks mismatch. Postgres `EXTRACT(ISOYEAR ...)`/`TO_CHAR(d,'IYYY-"W"IW')` are correct, but simplest is to identify a week by `week_start_date DATE` (the Monday): unambiguous, timezone-independent, sortable, range-queryable.

#### F-12: Concrete normalized schema sketch
- **Source**: training_knowledge
- **Confidence**: high
- **Related**: FR-1, FR-7, FR-11, NFR-4
- **Files**: —

`workspaces(id, name, created_at)` seeded with one row. `units(code PK, label, grams_per_unit NULL for qty)`. `ingredients(id, workspace_id FK NOT NULL, name, category, source CHECK in (usda,custom), fdc_id NULL, reference_grams DEFAULT 100, gram_weight_per_qty NULL, calories, protein_g, carbs_g, fat_g, fiber_g, micronutrients JSONB DEFAULT '{}', created_at; CHECK(source='custom' OR fdc_id IS NOT NULL); UNIQUE(workspace_id,fdc_id) WHERE fdc_id NOT NULL)`. `recipes(id, workspace_id FK, name, meal_type CHECK in 4, servings INT CHECK>=1, notes, source_link, created_at, updated_at)`. `recipe_ingredients(id, recipe_id FK ON DELETE CASCADE, ingredient_id FK, quantity, unit_code FK→units, position)`. `tags(id, workspace_id FK, label, UNIQUE(workspace_id,label))`. `recipe_tags(recipe_id, tag_id, PK both, ON DELETE CASCADE)`. `plan_entries(id, workspace_id FK, week_start_date DATE, day_of_week SMALLINT 0-6, meal_slot CHECK in 4, position, recipe_id NULL ON DELETE SET NULL, freeform_title NULL, freeform_description NULL, freeform_link NULL; CHECK((recipe_id IS NOT NULL) <> (freeform_title IS NOT NULL)))`. `usda_food_cache(fdc_id PK, payload JSONB, fetched_at)`. Indexes on every `workspace_id`, `recipes(workspace_id,meal_type)`, `recipe_ingredients(recipe_id)`, `plan_entries(workspace_id,week_start_date)`, `recipe_tags(tag_id)`.

#### F-13: Snapshot USDA nutrition into the ingredient at add-time
- **Source**: codebase
- **Confidence**: high
- **Related**: FR-2, FR-4
- **Files**: `artifacts/food-tracker.jsx`

`usda_food_cache` is workspace-agnostic shared reference data; `ingredients` are workspace-owned snapshots. If recipes referenced the cache directly, eviction/refresh would silently change historical recipe nutrition. Snapshot per-100g nutrition into the owned ingredient row at add-time; keep the cache as a pure lookup accelerator. Also normalize both USDA and custom nutrition to one `reference_grams` basis (removes the prototype's per-100g-vs-absolute inconsistency).

### Approaches Evaluated

**Preferred: Hybrid schema (macros columns + micronutrients JSONB) + seeded default-workspace FK.** Mirrors the prototype's data shapes while normalizing the week-key and dual-basis bugs. Tradeoffs: fast/indexable macros, zero schema churn for new micros, additive future auth; JSONB micros not trivially SQL-aggregatable (acceptable — display-only, sum in app). References: https://leapcell.io/blog/storing-dynamic-attributes-sparse-columns-eav-and-jsonb-explained, https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy

**Viable: Fully relational nutrients (EAV).** Makes "sum nutrient X" pure SQL but scatters hot macros into rows and adds join overhead; research rates EAV worse than JSONB for sparse attributes.

**Not recommended: Document/JSONB-heavy (recipes/plans as blobs).** Lowest port effort but loses FK integrity (tag filtering, "recipes using ingredient X") and complicates ownership.

### Resolved Uncertainties

| Question | Answer | Evidence |
| --- | --- | --- |
| JSONB vs relational rows for vitamins? | Macros columns, micros JSONB; hybrid not EAV | Leapcell/sqlpad/Crunchy research |
| Auth-ready without restructure? | workspace_id NOT NULL FK + seed one workspace | PlanetScale/Crunchy/Bytebase multi-tenancy |
| Identify a week reliably? | Store the Monday's DATE server-side | Postgres ISO-week edge cases; prototype bug |
| Units→grams and where units live? | Seeded units table + per-ingredient gram_weight_per_qty | Prototype UNITS/toGrams |
| Migration tool? | TS-native (Drizzle-kit / node-pg-migrate); Flyway if polyglot | Tooling research |

### Remaining Uncertainties
- On recipe delete, preserve the deleted recipe's name in history (snapshot/soft-delete) vs ON DELETE SET NULL (chosen: SET NULL tombstone).
- Whether the planner grid includes a snack slot (chosen: yes, all four).
- Store custom nutrition per-reference-quantity (chosen) vs prototype's absolute total.
- Compute totals on read (chosen at this scale) vs materialized cache.

---

## Aspect 4 — USDA FoodData Central integration

### Findings

#### F-14: API base, key handling, rate limit
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-2, FR-4, NFR-4, NFR-5
- **Files**: —

Base `https://api.nal.usda.gov/fdc/v1`; endpoints `/foods/search`, `/food/{fdcId}`, `/foods`, `/foods/list`. The data.gov key is the `?api_key=` query parameter → any client call leaks it, forcing a server proxy (NFR-4). Default rate limit is **1,000 requests/hour per IP** for a registered key; exceeding returns 429 with ~1h block; responses carry `X-RateLimit-Limit`/`X-RateLimit-Remaining`. `DEMO_KEY` is 30/hr, 50/day — not for production.

#### F-15: Search (flat) vs detail (nested) nutrient shapes; nutrient numbers
- **Source**: web_research (numbers: medium)
- **Confidence**: high (shapes), medium (specific micronutrient numbers)
- **Related**: FR-2, FR-4
- **Files**: —

`/food/{fdcId}` nests `{ nutrient: { id, number, name, unitName }, amount }`; `/foods/search` flattens to `nutrientId/nutrientNumber/nutrientName/unitName/value`. Map by the stable nutrient **number** (string), not id/name. Macros: Energy **208** (kcal), Protein **203**, Total fat **204**, Carbohydrate **205**, Fiber **291**. Common micros: Calcium 301, Iron 303, Sodium 307, Potassium 306, Vitamin C 401, Vitamin A RAE 320, Vitamin D 328, B-12 418. Prefer Energy 208 over Atwater variants 957/958. Verify micronutrient numbers against a live Foundation response in implementation.

#### F-16: Foundation+SR per-100g complete; Branded per-serving and often missing
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-4
- **Files**: —

Foundation Foods and SR Legacy report per-100g with analytically derived vitamins/minerals — best for reliable macro+micro data. Branded Foods omit nutrients (missing = "not supplied", NOT zero), may carry "Not a significant source of…" strings, and macros come from a per-serving `labelNutrients` object (camelCase) that must be normalized via `servingSize` before per-100g scaling. Query Foundation+SR Legacy first; treat missing branded nutrients as unknown.

#### F-17: Postgres cache-aside doubles as degradation store
- **Source**: web_research
- **Confidence**: high
- **Related**: NFR-5, NFR-7
- **Files**: —

Cache-aside in Postgres: check cache → on miss call USDA and persist → serve stale cache on upstream failure. Search cache key = hash(normalized lowercased query + dataType + page); detail cache key = `fdc_id`. TTL ≈ 7-30 days for detail (SR Legacy frozen since 2018), ≈ 24h-7d for search lists; serve stale on failure regardless of TTL. No extra service needed (Redis rejected on space/simplicity).

### Approaches Evaluated

**Preferred: Server-side proxy + Postgres cache-aside, Foundation+SR first.** Backend `/ingredients/search` + `/ingredients/usda/:fdcId` call USDA with the env-var key; normalize both nutrient shapes to one per-100g model keyed by nutrient number; cache in Postgres (also the degradation store). Satisfies NFR-4/5/7 with no new infra. References: https://fdc.nal.usda.gov/api-guide/, https://api.data.gov/docs/rate-limits/, https://fdc.nal.usda.gov/data-documentation/

**Viable: Bulk-download FDC datasets into Postgres.** Eliminates rate-limit risk and is fully offline, but Branded (~2M+ items) is large (conflicts with space efficiency) and adds an ingest pipeline. Overkill for MVP; reconsider later.

**Not recommended: Redis/in-memory cache.** Extra stateful container, volatile (lost on restart → weak NFR-7 fallback), no benefit over Postgres at this scale.

### Resolved Uncertainties

| Question | Answer | Evidence |
| --- | --- | --- |
| Current rate limit + key handling? | 1000/hr/key; `?api_key=` query param; X-RateLimit headers | FDC API Guide; data.gov rate-limit docs |
| Which dataTypes for reliable per-100g data? | Foundation + SR Legacy first; Branded fallback | FDC Foundation/Data Type docs |
| Nutrient representation? | Detail nested vs search flat; map by number; macros 208/203/204/205/291 | FDC API Guide; sample JSON; SR docs |
| Caching strategy/key/TTL? | Postgres cache-aside; key by query-hash / fdc_id; 7-30d / 24h-7d; serve stale on failure | USDA update cadence + 1000/hr limit |

### Remaining Uncertainties
- Exact full vitamin/mineral list to display — confirm against a live Foundation detail response.
- Include Branded in MVP search (breadth vs unreliable micros)? Chosen: fallback tier only.
- Accurate volume conversion needs a density source (Aspect 5) — out of scope to source fully for MVP.
- Concrete TTLs / whether to add a scheduled cache-warm job — depends on usage volume.

---

## Aspect 5 — Nutrition calculation engine

### Findings

#### F-18: Prototype calc engine is pure and extractable
- **Source**: codebase
- **Confidence**: high
- **Related**: NFR-3, FR-4
- **Files**: `artifacts/food-tracker.jsx`

`toGrams(amount, unit, dbItem)` and `calcRecipeNutrition(ingredients, servings)` are pure (no I/O, Date, randomness, or React deps): convert to grams, scale per-100g by grams/100, sum, divide by servings. The logic can be lifted verbatim into a dependency-free module that is trivially unit-testable (NFR-3) and shareable by web + api.

#### F-19: Fixed water-equivalent volume conversion is ~2× off for some foods
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-4, NFR-3
- **Files**: `artifacts/food-tracker.jsx`

The prototype UNITS table uses fixed grams per volume unit (tsp=5, tbsp=15, cup=240, …) regardless of ingredient. 1 cup flour ≈ 125g (prototype assumes 240g, ~92% over); 1 cup oil ≈ 225g. For olive oil at 884 cal/100g, a 15g cup error misstates ~133 kcal. Accurate conversion needs per-ingredient gram-equivalents (density), not a global table.

#### F-20: Round at display only; flag missing data rather than zero-filling
- **Source**: codebase
- **Confidence**: high
- **Related**: FR-4, FR-12, NFR-3
- **Files**: `artifacts/food-tracker.jsx`

The prototype rounds per-serving macros and vitamins mid-calculation, and WeeklyPlanner sums already-rounded values (compounding error across a week — FR-12). It also treats absent nutrient data as zero (custom nutrition defaults to 0; missing vitamin keys skipped; `qty` falls back to 100g) with no signal. For accuracy: keep full float precision, round only at display, sum unrounded per-serving values for weekly totals, and return a completeness descriptor enumerating missing/estimated data. Vitamins/minerals aggregate as a keyed union over nutrient name (absent keys contribute nothing).

### Approaches Evaluated

**Preferred: Pure deterministic engine with per-ingredient gram-equivalents + display-only rounding + completeness flags.** `computeRecipeNutrition(ingredients, servings) -> { total, perServing, completeness }`. Grams via mass (direct), volume (per-ingredient gramsPerUnit), or qty (per-ingredient usual-weight). Full precision; round at display. Tradeoffs: maximal accuracy, deterministic, trivially testable, reusable; requires sourcing per-ingredient density/usual-weight and flagging gaps. References: `artifacts/food-tracker.jsx`, https://www.kingarthurbaking.com/learn/ingredient-weight-chart

**Not recommended: Global water-equivalent table (prototype as-is).** Zero extra data but violates NFR-3 (up to ~2× error; fabricated 100g qty fallback; compounding in-loop rounding).

**Viable (as a refinement layer): Confirm-grams-at-entry.** UI converts to grams then asks the user to confirm/correct before storing, so the engine always operates on exact grams. Best combined with the preferred approach (pre-fill + override) — this is exactly AD-8.

### Resolved Uncertainties

| Question | Answer | Evidence |
| --- | --- | --- |
| Canonical formula + where to round? | grams→(per100g·grams/100)→sum→/servings; round only at display; weekly sums use unrounded per-serving | Prototype calc functions; USDA per-100g basis |
| Is fixed volume conversion accurate enough? | No; per-ingredient gram-equivalents needed | King Arthur / TheCalculatorSite weight charts |
| Aggregate differing vitamin sets? | Keyed union over nutrient name; absolute mass | Prototype vt-map accumulation |
| Where should the engine live? | Pure dependency-free shared module (web + api) | calc functions have no side effects |
| Handle missing data? | Flag incompleteness; never zero-fill or 100g-guess | Prototype silently zero-fills |

### Remaining Uncertainties
- Authoritative source/storage for per-ingredient densities and usual-weights (USDA portion data vs curated vs user-confirmed at entry — chosen: pre-fill + confirm).
- %DV vs absolute mass for micros — chosen: absolute mass (mg/mcg), %DV optional display.
- Exact NFR-3 rounding tolerance and the hand-verified test-recipe corpus — fix when building the engine.
- FR-12: exclude freeform meals entirely vs include with a flagged zero contribution — flag and exclude from totals.
