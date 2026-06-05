# Research Results: recipe-library

Findings partitioned from the holistic `spec-driven/meal-tracking-mvp/design.md` (via `--context`) to the recipe/nutrition scope. No new research subagents were dispatched. See the holistic `references/research.md` for the original aspect-level detail (Aspects 4 USDA and 5 nutrition engine are the primary sources here).

---

## Aspect — Nutrition engine

### Findings

#### F-3: Prototype calc engine is pure and extractable
- **Source**: codebase
- **Confidence**: high
- **Related**: FR-4, NFR-3
- `toGrams` and `calcRecipeNutrition` have no I/O, Date, randomness, or framework deps — liftable into a dependency-free module that is trivially unit-testable (NFR-3) and shareable by web + api.

#### F-4: Fixed water-equivalent volume conversion is ~2x off for some foods
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-4, NFR-3
- 1 cup flour ≈125g vs the prototype's 240g (~92% over); 1 cup oil ≈225g. Accurate conversion needs per-ingredient gram-equivalents, not a global table.

#### F-5: Round at display only; flag missing data rather than zero-filling
- **Source**: codebase
- **Confidence**: high
- **Related**: FR-4, NFR-3
- The prototype rounds per-serving mid-calc and sums already-rounded values (compounding error). It also zero-fills missing data silently. Keep full precision; round at display; return a completeness descriptor.

## Aspect — USDA FoodData Central integration

#### F-6: API base, key handling, rate limit
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-2, NFR-4, NFR-5
- Base `https://api.nal.usda.gov/fdc/v1`; key is the `?api_key=` query param → any client call leaks it. Default rate limit 1,000 req/hr per registered key; 429 on exceed; X-RateLimit headers enable backoff. DEMO_KEY (30/hr) not for production.

#### F-7: Search (flat) vs detail (nested) nutrient shapes; nutrient numbers
- **Source**: web_research
- **Confidence**: medium
- **Related**: FR-2, FR-4
- `/food/{fdcId}` nests `{nutrient:{number,...}, amount}`; `/foods/search` flattens to `nutrientNumber/value`. Map by stable number: Energy 208, Protein 203, Fat 204, Carbohydrate 205, Fiber 291 (+ micros). Verify micronutrient numbers against a live Foundation response.

#### F-8: Foundation+SR per-100g complete; Branded per-serving/missing
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-2, FR-4
- Foundation + SR Legacy report per-100g with analytic vitamin/mineral coverage. Branded omit nutrients ("not supplied", not zero) and use per-serving labelNutrients. Query Foundation+SR first; treat missing as unknown.

#### F-9: Postgres cache-aside doubles as degradation store
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-2, NFR-4, NFR-5
- Cache-aside in Postgres: check cache → on miss call USDA and persist → serve stale on upstream failure. Search key = hash(query+dataType+page); detail key = fdc_id. TTL ~7-30d detail / ~24h-7d search; serve stale on failure regardless of TTL. No extra service (Redis rejected).

#### F-11: Snapshot USDA nutrition into the ingredient at add-time
- **Source**: codebase
- **Confidence**: high
- **Related**: FR-2, FR-4
- `usda_food_cache` is workspace-agnostic shared reference data; `ingredients` are workspace-owned snapshots. Snapshot per-100g nutrition into the owned ingredient at add-time so cache eviction/refresh never silently changes historical recipes.

## Aspect — Schema and library UI

#### F-10: Hybrid columns + JSONB beats EAV for sparse nutrients
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-1, FR-3, FR-4
- Macros (always present) as columns; vitamins/minerals (sparse, display-only) as JSONB absolute mass. EAV worse on every axis.

#### F-1: Prototype is React; components/math port directly
- **Source**: codebase
- **Confidence**: high
- **Related**: FR-1, FR-5, FR-6
- The prototype's MealLibrary, RecipeModal, and ingredient UI port into React components.

#### F-2: TanStack Query handles the async matrix
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-1, FR-5, FR-6
- Caching/dedup/retry/loading/error for recipe list, search, and CRUD; query keys drive filter/search.

### Approaches Evaluated

**Preferred: pure shared nutrition engine + USDA proxy with Postgres cache-aside + hybrid schema + TanStack Query UI.** See ADs 1-6. References: holistic design AD-3/4/7/8/10; https://fdc.nal.usda.gov/api-guide/; https://api.data.gov/docs/rate-limits/; https://tanstack.com/query/latest; https://orm.drizzle.team/

**Viable: bulk-download FDC datasets into Postgres.** Eliminates rate-limit risk but Branded is huge; overkill for MVP.

**Not recommended: client-side USDA calls / Redis cache / EAV nutrients / global volume factors.** Leak the key / extra volatile service / join overhead / NFR-3 breach respectively.

### Resolved Uncertainties

| Question | Answer | Evidence |
| --- | --- | --- |
| Engine location? | Pure shared TS package (web + api) | F-3 |
| Volume accuracy? | Per-ingredient gram-equivalents + confirm | F-4 |
| Missing data? | Completeness flag, never zero | F-5 |
| Key protection + rate limit? | Server proxy + Postgres cache-aside; stale on outage | F-6, F-9 |
| Which dataTypes? | Foundation+SR first, Branded fallback; map by number | F-7, F-8 |
| Recipe stability vs cache? | Snapshot nutrition into owned ingredient at add-time | F-11 |
| Macros vs micros storage? | Macro columns + micronutrient JSONB absolute mass | F-10 |

### Remaining Uncertainties
- Exact vitamin/mineral display list — confirm against a live Foundation detail response.
- NFR-3 rounding tolerance + test-recipe corpus — fix when building the engine.
