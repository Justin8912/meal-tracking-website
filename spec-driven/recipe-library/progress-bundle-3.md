# Progress: Bundle 3 — USDA Proxy & Ingredients

> Tasks: spec-driven/recipe-library/tasks.md | Bundle: 3 | Started: 2026-05-30 | Last Updated: 2026-05-30

Progress: 10/10 steps complete

## Current State

- Stage: depth
- Last completed: STEP-27 — snapshot USDA nutrition at add-time + gram resolution
- Next up: bundle complete; downstream STEP-39 (recipe ingredient hydration) and
  STEP-46 consume these routes in later bundles.
- Blockers: none.

The USDA proxy and ingredient surface are live and TDD-covered:

- `apps/api/src/usda/mapper.ts` — maps BOTH USDA shapes (flat `/foods/search`
  `nutrientNumber`+`value` and nested `/food/{fdcId}` `nutrient.number`+`amount`)
  by stable nutrient number (208/203/204/205/291) to one per-100g model;
  missing nutrients omitted, never zeroed (F-7, F-8, S-6).
- `apps/api/src/usda/client.ts` — `searchFoods`/`getFood` call USDA with the
  api_key from runtime config (S-2), Foundation+SR Legacy first with a Branded
  fallback (F-8); 429/timeout/non-2xx surface as a typed `UsdaError`
  (`USDA_UNAVAILABLE`, statusCode 502, `rateLimited` flag). Fetch + base URL are
  injectable so tests never hit the real API.
- `apps/api/src/usda/cache.ts` — Postgres cache-aside over `usda_food_cache`
  (Drizzle upsert, S-4): detail keyed by `fdc_id`, search by sha256 of the
  normalized query (`search:<hash>` in the shared PK column). Fresh hit skips
  USDA (F-6); on USDA failure serves a stale entry if present, else propagates
  the typed error (F-9, AC-2.3). Pure accelerator — recipes never reference it.
- `apps/api/src/routes/ingredients.ts` — `GET /ingredients/search?q=`,
  `GET /ingredients/usda/:fdcId` (proxy), `POST /ingredients/usda/:fdcId`
  (snapshot-at-add), `POST /ingredients` (custom create), `GET /ingredients`
  (list). The key never appears in bodies/headers/logs (AC-2.4, redacted in
  pino). Typed USDA failure → shared error envelope with a clear code (AC-2.3).
  Responses Zod-validated (S-3).
- `apps/api/src/config/env.ts` — adds optional `USDA_API_KEY` (env-only, S-2)
  and `USDA_BASE_URL` (defaults to production, test-overridable).
- `apps/api/src/server.ts` — builds the cache-aside client from config or
  accepts an injected stub (`usdaClient`) for tests; registers the ingredient
  routes; redacts the key from logs.

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-18 | done | 619baa5 | Test-first: USDA nutrient-number mapping (both shapes) |
| STEP-19 | done | ce1b79b | USDA client + mapper; Foundation+SR first; typed UsdaError; key env-only |
| STEP-20 | done | b8a49be | Test-first: cache-aside + stale-on-outage |
| STEP-21 | done | ce0a725 | Postgres cache-aside; serve stale on failure; pure accelerator |
| STEP-22 | done | a37605b | Test-first: proxy routes; key-absent; outage envelope |
| STEP-23 | done | 685d694 | GET /ingredients/search + /ingredients/usda/:fdcId; envelope on UsdaError |
| STEP-24 | done | 32cc96c | Test-first: custom ingredient CRUD |
| STEP-25 | done | 98f035e | POST/GET /ingredients; workspace-scoped; reference_grams basis |
| STEP-26 | done | 305f5e9 | Test-first: snapshot-at-add + gram resolution |
| STEP-27 | done | c4e3854 | POST /ingredients/usda/:fdcId snapshot; gram-equivalents; cache-independent |

## Verification

- `npm run typecheck` (all workspaces): clean.
- `npm test` WITHOUT `DATABASE_URL`: shared 22, nutrition-engine 27, web 9,
  api 13 passed + 35 skipped gracefully — 0 failures, no regression.
- API suite WITH `DATABASE_URL` (disposable `postgres:16-alpine` on :55434,
  migrations 0001+0002 applied): 48 passed (15 files), including the 25 new
  USDA/ingredient tests (mapper 3, client 6, cache 5, proxy routes 4, custom 4,
  snapshot 3) plus all prior bundles green. `fileParallelism:false` retained.
- `npm run build -w @meal-tracking/api`: compiles (shared + tsc) clean.

## Bundle Verify (integration)

- Search returns normalized per-100g USDA data via the server-side proxy —
  PASS (`ingredients.test.ts`).
- The api_key is absent from response bodies AND headers — PASS (asserted on
  search + detail; redacted from logs).
- Degradation: a failed lookup with a stale cache serves the stale entry; with
  no cache it returns the `USDA_UNAVAILABLE` error envelope — PASS
  (`cache.test.ts` stale-serve + no-cache-propagate; `ingredients.test.ts`
  outage envelope).
- Adding a USDA food snapshots its nutrition into an owned ingredient and the
  snapshot survives clearing `usda_food_cache` — PASS
  (`ingredients-snapshot.test.ts`).

## Notes / Limitations

- The real USDA API is never contacted in tests: the HTTP layer (fetch + base
  URL) is injectable and stubbed with fixture payloads for both nutrient shapes;
  route/cache/snapshot tests inject a stub `UsdaClient`.
- DB-touching tests run against a disposable Dockerized `postgres:16-alpine`
  (cached image, RUN only — no image build, so the corporate TLS proxy is not a
  factor) and skip gracefully when `DATABASE_URL` is unset.
- The `usda_food_cache` table is keyed by a single text PK (`fdc_id`). Search
  results reuse this column with a `search:<sha256>` prefix rather than adding a
  migration, keeping migration 0002 unchanged.

## Session Log

### 2026-05-30 — bundle complete
- Completed: STEP-18 through STEP-27 (TDD: failing test then implementation per step).
- Decisions:
  - USDA key + base URL added to platform config (env-only, S-2); base URL
    injectable for tests; client `fetchImpl` injectable so the real API is never hit.
  - Search cache key = `search:<sha256(normalized query)>` reusing the existing
    `usda_food_cache.fdc_id` PK — no schema change.
  - Snapshot endpoint is `POST /ingredients/usda/:fdcId` returning the owned
    ingredient; gram-equivalents accepted in the body (confirm-at-entry, AD-4).
  - Macro columns stay NULL when USDA omits a nutrient (S-6); the response maps
    NULL → omitted, never zero.
- Next: none for this bundle.
