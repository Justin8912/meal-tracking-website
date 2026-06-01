# Progress: Bundle 6 — Integration & Verification

> Tasks: spec-driven/recipe-library/bundle-6.md | Bundle: 6 | Branch: impl/recipe-library/bundle-6 | Last Updated: 2026-06-01

Progress: 4/4 steps complete

## Current State

- Stage: integration
- Last completed: STEP-47 — mobile-responsive verification (NFR-2)
- Next up: none — recipe-library bundles 1-6 complete
- Blockers: none

Bundle 6 wires and verifies the whole recipe library end to end. No new product
behavior is added beyond one correctness fix (the macro-completeness guard,
STEP-46); the bundle is verification artifacts that re-run via the suite:

- **STEP-46 (accuracy + macro-completeness, `b7b558e`)** — A hand-verified
  accuracy corpus (`packages/nutrition-engine/src/accuracy.test.ts`) spans mixed
  units (g/cup/tbsp/qty) in one recipe, 4 servings, a custom ingredient, and a
  missing-data case, asserting `computeRecipeNutrition` matches expected totals
  within an EXPLICIT tolerance (+/-1 kcal, +/-0.5 g macros, +/-0.5 mass micro)
  and that incomplete recipes are flagged, never zero-filled (NFR-3, AC-3.2,
  AC-4.1, S-6). The Bundle 5 limitation is fixed: see Session Log.
- **STEP-44 (recipe -> nutrition e2e, `6630078`)** — `apps/api/src/routes/
  e2e-recipe-nutrition.test.ts` drives the real api -> drizzle -> postgres stack:
  search the USDA proxy, snapshot a food into an owned ingredient, create a
  custom ingredient, save a recipe with both (mixed units, 2 servings), then
  RELOAD (recipe detail + ingredient list) and recompute with the shared engine.
  Asserts combined total + per-serving within tolerance, custom contributes
  (AC-3.2), missing data flagged (S-6), and result stable on a second reload.
- **STEP-45 (USDA-degradation e2e, `9a3ac3d`)** — `apps/api/src/routes/
  e2e-usda-degradation.test.ts` wires the production cache-aside client over a
  togglable inner stub against the real DB cache: cold cache + USDA down ->
  clear `USDA_UNAVAILABLE` envelope; the custom path still works during the
  outage; a previously-cached lookup still resolves (stale-on-failure, F-9)
  while a never-cached query still fails clearly (AC-2.3, NFR-5).
- **STEP-47 (mobile-responsive, `b02b843`)** — `apps/web/src/views/
  MealLibrary.responsive.test.tsx` verifies at a 390px viewport that the
  browse/filter/search controls and the editor (open, add-ingredient search,
  custom escape hatch, per-serving panel, submit) are reachable and that every
  form control has an accessible name and is keyboard-focusable (WCAG 2.1 AA
  basics), plus a documented manual layout check (NFR-2).

New `npm run e2e:recipe -w @meal-tracking/api` runs both DB-backed e2e specs.
The full `npm test` stays green WITHOUT a DB/browser (DB-backed tests
skip-gracefully); with `DATABASE_URL` set against a Dockerized postgres they all
run. No emojis anywhere (S-7); the engine stays pure/TDD (S-1); missing data is
surfaced via completeness, never zero-filled (S-6).

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-44 | done | `6630078` | Integration e2e (Supertest -> api -> Dockerized postgres): USDA proxy + custom -> recipe save -> reload -> recompute via shared engine; combined + per-serving within tolerance; custom contributes (AC-3.2); stable on reload. Integration/component fallback (not browser) — TLS proxy blocks Playwright browser DL |
| STEP-45 | done | `9a3ac3d` | Integration e2e: production cache-aside over togglable stub + real DB cache. Cold cache + outage -> clear envelope (AC-2.3); custom path works during outage; cached lookup resolves stale-on-failure (F-9, NFR-5). Web search-error->custom path already covered by IngredientPicker test |
| STEP-46 | done | `b7b558e` | Unit accuracy corpus (mixed g/cup/tbsp/qty, 4 servings, custom, missing-data) within explicit tolerance (+/-1 kcal, +/-0.5 g, +/-0.5 micro); missing flagged not zeroed (NFR-3, AC-3.2/4.1). FIXED Bundle 5 macro-completeness gap (see Session Log) |
| STEP-47 | done | `b02b843` | Responsive/a11y verification at 390px (jsdom): controls reachable, labeled, focusable (WCAG 2.1 AA basics); pixel overflow is a documented manual/Playwright check. Component fallback — TLS proxy blocks Playwright browser DL |

## Session Log

### 2026-06-01 — Bundle 6 complete (4/4)

- **Completed**: STEP-44, STEP-45, STEP-46, STEP-47.
- **STEP-46 macro-completeness fix (the Bundle 5 limitation)**: the web editor's
  `toEngineNutrition` coerces an API-ABSENT macro to a placeholder `0` so the
  numeric engine has something to add. Before this bundle the engine had NO way
  to distinguish "the user logged a real 0 g fiber" from "the source never
  reported fiber", so a recipe built from such an ingredient reported
  `completeness.complete = true` with an understated total — a silent zero-fill
  that violates S-6/F-5. **Fix**: `NutritionIngredient` gains an optional
  `absentMacros: MacroKey[]` marker; `computeRecipeNutrition` still sums the
  present macros (the absent one unavoidably adds 0) but flags the line
  `missing-macros: <keys>` so the recipe is reported incomplete. The web layer
  (`absentMacrosOf` in `query/ingredients.ts`, wired through `RecipeEditor` /
  `IngredientPicker`) populates the marker from API-omitted macro fields.
  Guarded by accuracy.test.ts (engine: identical numbers, flag differs by the
  marker alone) AND RecipeEditor.test.tsx (editor surfaces the incomplete
  indicator for an absent macro, but NOT for a genuine 0). This is the
  failing-then-fixed contract the bundle asked for, now explicit.
- **Accuracy corpus + tolerance**: tolerance pinned at +/-1 kcal, +/-0.5 g on
  macros, +/-0.5 (same unit) on mass micronutrients. The arithmetic is exact, so
  every corpus assertion sits far inside tolerance — the tolerance is the
  published display-side contract (S-6), not a license to round mid-sum.
- **Degradation + mobile results**: degradation e2e (3/3) confirms clear error,
  unblocked custom entry, and stale-on-failure cache resolution; mobile
  verification (3/3) confirms reachable, labeled, focusable controls at 390px.
- **Decisions**: added `@meal-tracking/nutrition-engine` as an api devDependency
  so the e2e harness recomputes with the SAME engine the web client uses (no
  bespoke arithmetic). Added `e2e:recipe` script (kept OUT of the default
  `vitest` run is unnecessary — the specs DB-skip-gracefully, so they live in the
  normal `npm test` and simply skip without `DATABASE_URL`).
- **Environment limitation (documented, not blocking)**: the in-sandbox
  corporate TLS-intercepting proxy blocks Playwright browser downloads, so
  STEP-44/45/47 ran as INTEGRATION/COMPONENT-level verification (Supertest
  against a real Dockerized postgres for the API stack; jsdom/testing-library for
  the SPA) rather than true browser e2e. The postgres image (`postgres:16-alpine`)
  pulls fine; only browser/registry IMAGE builds are proxy-affected. Verified
  locally with `DATABASE_URL` pointed at a disposable `postgres:16-alpine`
  container — full suite green (engine 35, shared 22, api 74, web 22). The
  pixel-level 390px overflow/clipping check is a documented manual step
  (MealLibrary.responsive.test.tsx) to promote to a Playwright
  `setViewportSize(390)` assertion once a browser is reachable.
- **Next**: none — recipe-library bundles 1-6 are complete and green.
