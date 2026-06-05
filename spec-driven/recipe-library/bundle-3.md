# Bundle 3: USDA Proxy & Ingredients

> Slice 2: Feature Depth (Stage: depth)
> Stage: depth | Parallel: no (shares routes/ingredients.ts and server.ts) | Files: apps/api/src/usda/client.ts, apps/api/src/routes/ingredients.ts, apps/api/src/server.ts

**Bundle Verify**: Ingredient search returns normalized USDA data through the server-side proxy, degrades to cache/custom-entry on outage, and snapshots nutrition at add-time.
- **Level**: integration
- **Given**: api running with a stubbed USDA upstream and seeded postgres
- **Action**: search an ingredient, add it to the workspace, then repeat the search with USDA forced to fail
- **Outcome**: first search returns normalized per-100g nutrition (cached); the added ingredient carries a snapshot; the failed search serves stale cache or returns the error envelope (never leaks the key)

> **Context**
>
> **Applicable ACs**
> - **AC-2.1**: Given: I am adding an ingredient / When: I type a food name / Then: matching foods from USDA FoodData Central are shown
> - **AC-2.2**: Given: a search result list / When: I select a food and enter a quantity and unit / Then: the ingredient is added with its nutrition attached
> - **AC-2.3**: Given: the nutrition API is slow or unavailable / When: I attempt a search / Then: a clear error is shown and I can still add a custom ingredient
> - **AC-2.4**: Given: any ingredient search / When: the request is made / Then: the API key is used server-side and never visible in the browser
> - **AC-3.1**: Given: I am adding ingredients / When: I choose custom and enter nutrition facts / Then: the custom ingredient is created and added
> - **AC-3.2**: Given: a recipe containing a custom ingredient / When: nutrition is calculated / Then: the custom ingredient's values are included
> - **AC-3.3**: Given: a custom ingredient created previously / When: I add ingredients to another recipe / Then: I can find and reuse it
> - **AC-4.5**: Given: an ingredient in a non-gram unit / When: nutrition is calculated / Then: the quantity is converted consistently
>
> **Architecture Decisions**
> - **AD-3: USDA proxy with Postgres cache-aside and graceful degradation** — Decision: /ingredients/search + /ingredients/usda/:fdcId call USDA with env-var key, Foundation+SR first (Branded fallback), normalize both nutrient shapes by stable nutrient number, cache-aside in usda_food_cache; on failure serve stale cache or the error envelope; missing nutrients = unknown.
> - **AD-4: Per-ingredient gram-equivalents + confirm; snapshot at add-time** — Decision: snapshot per-100g nutrition into the owned ingredients row at add-time; usda_food_cache stays a pure accelerator.
>
> **Findings**
> - **F-6: USDA api_key query param, 1000 req/hr, server-side** — proxy required; cache to respect the limit.
> - **F-7: Search (flat) vs detail (nested) nutrient shapes** — two parsers; map by stable nutrient number.
> - **F-8: Foundation+SR per-100g complete; Branded missing/per-serving** — query Foundation+SR first; missing = unknown.
> - **F-9: Postgres cache-aside doubles as degradation store** — serve stale on outage.
> - **F-11: Snapshot USDA nutrition into the ingredient at add-time** — recipes reference a stable owned snapshot.
>
> **Standards**
> - **S-2**: USDA API key only from runtime env; never client-side or in build ARG (Domain: security | File Type: *)
> - **S-3**: Validate API inputs/outputs with shared Zod schemas (Domain: api-design | File Type: .ts)
> - **S-4**: Use Drizzle/parameterized queries; never concatenate SQL (Domain: security | File Type: .ts/.sql)
> - **S-6**: Round nutrition only at display; never zero-fill missing data (Domain: other | File Type: .ts)
> - **S-7**: No emojis (Domain: other | File Type: *)
>
> **Constraints**
> - USDA key supplied as ?api_key= → all USDA calls server-side (Category: security | Source: technical)
> - USDA free tier ~1000 req/hr (Category: infrastructure | Source: technical)
>
> **Risks**
> - Cold cache bursts toward 1000 req/hr, blocking the key (Impact: medium | Mitigation: cache-aside + 429 backoff; serve stale)
> - Treating missing branded nutrients as zero understates totals (Impact: high | Mitigation: map by number; missing = unknown)
>
> **Contracts**
> - GET /ingredients/search?q= — USDA proxy search; stale-on-outage or error envelope
> - GET /ingredients/usda/:fdcId — USDA detail proxy; normalized per-100g
> - POST /ingredients — create custom ingredient; GET /ingredients — list saved (USDA snapshots + custom)

#### STEP-18: Test-first — USDA nutrient-number mapping
MANUAL -> Test-first for STEP-19

> **Intent**: The two USDA endpoints return different shapes — `/foods/search` is flat (`nutrientNumber`), `/food/{id}` nests under `nutrient.number` (F-7). Tests must feed both shapes and assert mapping by stable number (Energy 208, Protein 203, Fat 204, Carbs 205, Fiber 291) to one per-100g model, with absent nutrients omitted (not zero — F-8).

- Write Vitest tests with fixture payloads for both search (flat) and detail (nested) shapes; assert the mapper yields identical normalized per-100g macros keyed by nutrient number; a missing nutrient is absent (not 0)
- Tests fail before STEP-19

**Verify**:
- Level: unit | Given: search + detail fixtures | Action: run the mapper test before STEP-19 | Outcome: fail (mapper not implemented)

> Depends on: STEP-3 | Enables: STEP-19 | Parallel with: —

#### STEP-19: USDA client with nutrient-number mapping
[FR-2 -> AC-2.1, AC-2.2] | create `apps/api/src/usda/client.ts` | Effort: M

> **Intent**: Calls USDA with the key from env (S-2, AC-2.4), querying `dataType=Foundation,SR Legacy` first (Branded fallback) for complete per-100g data (F-8). Two parsers map the flat (search) and nested (detail) shapes by stable nutrient number (F-7) to one normalized model; absent nutrients are omitted, never zero (F-8, S-6). Honor `X-RateLimit-Remaining`/429 to avoid blocking the shared key.
> **Standards**: S-2, S-6, S-7

- Implement `searchFoods(query)` and `getFood(fdcId)` hitting api.nal.usda.gov with `api_key` from env (read via platform config)
- Query Foundation+SR Legacy first; fall back to Branded; map by nutrient number to per-100g {calories,protein,carbs,fat,fiber, micronutrients}
- Omit missing nutrients (no zero); surface 429/timeout as a typed error for the caller's degradation path

**Verify**:
- Level: unit | Given: stubbed USDA search + detail responses | Action: searchFoods/getFood | Outcome: normalized per-100g model keyed by number; missing nutrients omitted — STEP-18 tests pass
- Level: integration | Given: a stubbed 429 from USDA | Action: searchFoods | Outcome: raises the typed rate-limit error (for STEP-21 to handle), key never in any client-visible output

> Depends on: STEP-18 | Enables: STEP-21, STEP-23 | Parallel with: —

#### STEP-20: Test-first — cache-aside and stale-on-outage
MANUAL -> Test-first for STEP-21

> **Intent**: The cache both respects the 1000/hr limit and is the degradation store (F-9). Tests must assert: a miss calls USDA once and persists; a hit serves from cache without calling USDA; and when USDA fails but a stale entry exists, the stale entry is served (AC-2.3). A cache that doesn't serve stale on failure would break degradation.

- Write integration tests: first lookup populates usda_food_cache and calls USDA once; second identical lookup hits cache (no USDA call); with USDA failing and a stale entry present, the stale entry is returned
- Tests fail before STEP-21

**Verify**:
- Level: integration | Given: the cache tests | Action: run before STEP-21 | Outcome: fail (cache-aside not implemented)

> Depends on: STEP-19 | Enables: STEP-21 | Parallel with: —

#### STEP-21: Postgres cache-aside with stale-on-outage
[FR-2 -> AC-2.3] | modify `apps/api/src/usda/client.ts` | Effort: S

> **Intent**: Cache-aside in `usda_food_cache` (keyed by fdc_id for detail, by normalized query for search). On a miss, call USDA and persist; on a hit, skip the call (rate-limit protection, F-6); on USDA failure, serve the stale cache if present, else propagate the error so the route returns the envelope and the UI steers to custom entry (AC-2.3, F-9).
> **Standards**: S-4, S-7

- Wrap searchFoods/getFood with read-through cache against usda_food_cache (Drizzle)
- On upstream failure: return stale cache if present; otherwise propagate the typed error
- Record fetched_at for TTL; serving stale on failure ignores TTL

**Verify**:
- Level: integration | Given: a cached entry and USDA forced to fail | Action: lookup | Outcome: stale cache served; with no cache + USDA failing, the typed error propagates (no key leak) — STEP-20 tests pass

> Depends on: STEP-20, STEP-19 | Enables: STEP-23 | Parallel with: —

#### STEP-22: Test-first — ingredient proxy routes
MANUAL -> Test-first for STEP-23

> **Intent**: The proxy is the only thing the browser talks to — the key must never appear in responses or logs (AC-2.4). Tests must assert search returns normalized results, the key is absent from all output, and an upstream outage yields a clear error envelope (AC-2.3) rather than a 500 stack.

- Write Supertest tests: GET /ingredients/search returns normalized results; the api_key never appears in the response/headers; with USDA failing and no cache, returns the error envelope with a clear code
- Tests fail before STEP-23

**Verify**:
- Level: integration | Given: the proxy tests | Action: run before STEP-23 | Outcome: fail (routes not implemented)

> Depends on: STEP-21 | Enables: STEP-23 | Parallel with: —

#### STEP-23: Ingredient proxy routes
[FR-2 -> AC-2.1, AC-2.3, AC-2.4] | create `apps/api/src/routes/ingredients.ts`; modify `apps/api/src/server.ts` | Effort: S

> **Intent**: Exposes `/ingredients/search` and `/ingredients/usda/:fdcId` that call the cached USDA client server-side. The browser never sees the key (AC-2.4). On the client's typed failure, return the shared error envelope so the UI can offer custom entry (AC-2.3). Responses validated/serialized via shared schemas (S-3).
> **Standards**: S-2, S-3, S-4, S-7

- Implement GET /ingredients/search?q= and GET /ingredients/usda/:fdcId calling the cached USDA client
- Map the typed rate-limit/outage error to the error envelope (clear code)
- Register routes on the server; never include the key in responses or logs

**Verify**:
- Level: integration | Given: stubbed USDA | Action: GET /ingredients/search?q=chicken | Outcome: normalized results; key absent from response/headers
- Level: integration | Given: USDA failing, no cache | Action: GET /ingredients/search | Outcome: error envelope with a clear code (UI fallback path) — STEP-22 tests pass

> Depends on: STEP-22, STEP-21 | Enables: STEP-25, STEP-39 | Parallel with: —

#### STEP-24: Test-first — custom ingredient CRUD
MANUAL -> Test-first for STEP-25

> **Intent**: Custom ingredients (FR-3) are the fallback when USDA lacks a food and must persist for reuse (AC-3.3). Tests must assert a custom ingredient is created workspace-scoped with its nutrition on a reference-grams basis, and that GET /ingredients lists it for reuse.

- Write Supertest tests: POST /ingredients (custom, with macros + optional micros) persists workspace-scoped; GET /ingredients includes it; validation rejects a custom ingredient with no nutrition basis
- Tests fail before STEP-25

**Verify**:
- Level: integration | Given: the custom-ingredient tests | Action: run before STEP-25 | Outcome: fail (routes not implemented)

> Depends on: STEP-4 | Enables: STEP-25 | Parallel with: —

#### STEP-25: Custom ingredient create and list
[FR-3 -> AC-3.1, AC-3.3] | modify `apps/api/src/routes/ingredients.ts` | Effort: S

> **Intent**: Persists user-entered nutrition as a workspace-scoped `source='custom'` ingredient on a `reference_grams` basis (uniform with USDA snapshots, so the engine treats both identically — AC-3.2). Listing saved ingredients enables reuse across recipes (AC-3.3). Validate via shared Zod (S-3); parameterized writes (S-4).
> **Standards**: S-3, S-4, S-7

- POST /ingredients: validate, insert source='custom' workspace-scoped with macros + optional micronutrients on reference_grams
- GET /ingredients: list the workspace's saved ingredients (custom + USDA snapshots) for reuse
- Reject custom ingredients lacking a nutrition basis

**Verify**:
- Level: integration | Given: a posted custom ingredient | Action: POST then GET /ingredients | Outcome: persisted workspace-scoped and listed for reuse — STEP-24 tests pass

> Depends on: STEP-24, STEP-23 | Enables: STEP-39 | Parallel with: —

#### STEP-26: Test-first — snapshot-at-add and gram resolution
MANUAL -> Test-first for STEP-27

> **Intent**: Adding a USDA food to the workspace must snapshot its per-100g nutrition into an owned `ingredients` row so later cache eviction never changes historical recipes (F-11). Tests must assert the snapshot is independent of the cache (evict cache → ingredient nutrition unchanged) and that gram-equivalents/usual-weight are stored for AC-4.5 conversion.

- Write integration tests: adding a USDA food creates an owned ingredient snapshot; clearing usda_food_cache leaves the snapshot intact; gram_weight_per_qty / volume gram-equivalents persisted
- Tests fail before STEP-27

**Verify**:
- Level: integration | Given: the snapshot tests | Action: run before STEP-27 | Outcome: fail (snapshot logic not implemented)

> Depends on: STEP-23 | Enables: STEP-27 | Parallel with: —

#### STEP-27: Snapshot nutrition at add-time + gram resolution
[FR-2 -> AC-2.2 | FR-3 -> AC-3.2 | FR-4 -> AC-4.5] | modify `apps/api/src/routes/ingredients.ts` | Effort: S

> **Intent**: When a USDA food is added to the workspace, copy its normalized per-100g nutrition into an owned `ingredients` row (snapshot) and persist its gram-equivalents/usual-weight so the engine can convert any unit (AC-4.5) and recipes stay stable as the cache changes (F-11). Both USDA snapshots and custom ingredients then feed the engine uniformly (AC-3.2).
> **Standards**: S-4, S-6, S-7

- On adding a USDA food, insert an owned ingredient (source='usda', fdc_id set) snapshotting per-100g macros + micronutrients
- Persist gram_weight_per_qty and any known volume gram-equivalents (seeded from USDA portion data where available; else flagged)
- Keep usda_food_cache as a pure accelerator (recipes never reference it directly)

**Verify**:
- Level: integration | Given: a USDA food added then the cache cleared | Action: read the owned ingredient | Outcome: snapshot nutrition intact (independent of cache); gram-equivalents stored for conversion — STEP-26 tests pass

> Depends on: STEP-26, STEP-23 | Enables: STEP-39, STEP-46 | Parallel with: —
