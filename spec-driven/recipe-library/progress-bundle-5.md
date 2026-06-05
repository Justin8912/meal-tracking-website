# Progress: Bundle 5 — Meal Library UI

> Tasks: spec-driven/recipe-library/bundle-5.md | Bundle: 5 | Branch: impl/recipe-library/bundle-5 | Last Updated: 2026-05-30

Progress: 8/8 steps complete

## Current State

- Stage: depth
- Last completed: STEP-43 — search box and empty state in MealLibrary
- Next up: Bundle 6 (recipe-library e2e + final wiring)
- Blockers: none

The Meal Library UI is implemented in `apps/web` via TDD, building on Bundle 1's
MealLibrary view + `useRecipes` query and the Bundle 1-4 API. The shared
nutrition engine is now a web dependency so the editor recomputes nutrition
live in the browser:

- `RecipeEditor.tsx` (STEP-37): recipe form (name, meal type, servings,
  ingredients, notes, source link, tags). Any change to ingredients/quantity/
  unit/servings recomputes nutrition LIVE via `computeRecipeNutrition` and
  renders only through `formatNutrition` (S-6 — the component never rounds and
  never zero-fills). The engine's `completeness` flag drives an "incomplete"
  indicator (panel-level + per-line) so unresolved lines are excluded from
  totals rather than shown as 0. Saving goes through a `useSaveRecipe` TanStack
  Query mutation (POST or PUT by `recipeId`) that invalidates `['recipes']` so
  the saved recipe appears in the library (AC-1.1, AC-4.4). Form validated
  against the shared `recipeInputSchema` (S-3).
- `IngredientPicker.tsx` (STEP-39): debounced USDA search (`useDebouncedValue`
  + a TanStack Query against `/ingredients/search`) renders normalized matches
  (AC-2.1); selecting one pre-fills a confirmable gram weight (AD-4) and on
  confirm snapshots the food (`POST /ingredients/usda/:fdcId`) into an owned
  ingredient, then adds the editor line with its reference-grams-basis nutrition
  for the engine. A custom-ingredient form posts to `/ingredients` and adds the
  line (AC-3.1). On a search error a clear alert plus the always-available
  custom-entry path keep the user unblocked (AC-2.3).
- `MealLibrary.tsx` (STEP-41/43): tag + meal-type filter controls (tags from a
  new `useTags` query against `/tags`) and a debounced search box set
  `tag`/`mealType`/`q` in the `useRecipes` query KEY, so TanStack Query refetches
  the server-filtered/searched list (Bundle 4) and caches per combination —
  never client-side filtering (AC-5.2/5.3/6.1). Distinct empty states: active
  search with no match -> "No recipes found" (AC-6.2); active filter with no
  match -> filter-specific message; initial empty -> "no recipes yet" — none a
  blank screen, all distinct from loading. The editor is mounted behind an "Add
  recipe" toggle so the full create -> live nutrition -> save -> appears-in-list
  flow is reachable.

Controls are stacked/full-width for phone use (NFR-2); no emojis anywhere (S-7).

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-36 | done | `9bfd4cd` | Test-first RecipeEditor: servings 1->2 halves per-serving calories via the shared engine; missing-data line shows "incomplete", not 0; red before STEP-37 |
| STEP-37 | done | `9c70bdf` | RecipeEditor: live nutrition via computeRecipeNutrition + formatNutrition (never rounds, S-6), completeness flag as incomplete indicator, useSaveRecipe mutation (POST/PUT) invalidating ['recipes'], Zod-validated form (S-3), responsive |
| STEP-38 | done | `c6bc239` | Test-first IngredientPicker: typing shows USDA matches, select pre-fills confirmable grams, custom path adds ingredient, search error shows alert + custom fallback; red before STEP-39 |
| STEP-39 | done | `7e42a7f` | IngredientPicker: debounced USDA search query, snapshot-on-confirm (POST /ingredients/usda/:fdcId) with gram confirm (AD-4), custom-ingredient form (POST /ingredients), error -> alert + custom path (AC-2.3); + query/ingredients + useDebouncedValue |
| STEP-40 | done | `d04f6fc` | Test-first filters: tags loaded from /tags, selecting mealType/tag changes recipes query params (refetch) + renders narrowed list, filtered-empty shows empty state; red before STEP-41 |
| STEP-41 | done | `5375494` | MealLibrary filters: useTags query, tag/mealType set in useRecipes query key (server-filtered, AC-5.2/5.3), filter-specific empty state, phone-usable controls |
| STEP-42 | done | `d8b2bc8` | Test-first search: typing debounces q into the query key (AC-6.1: chick -> Chicken Bowl), no-match -> "No recipes found" (AC-6.2); red before STEP-43 |
| STEP-43 | done | `61548f2`, `2f21ec8` | MealLibrary search box (debounced q in query key) + distinct empty states; `2f21ec8` mounts RecipeEditor behind an "Add recipe" toggle so the create flow is reachable (AC-1.1) |

Setup commit: `dd03910` — added `@meal-tracking/nutrition-engine` to the web
workspace so the editor can compute live nutrition in the browser (AD-5).

## Verification

- Typecheck (`npm run typecheck`): all four workspaces clean
  (nutrition-engine, shared, api, web).
- Tests (`npm test`): nutrition-engine 27, shared 22, api 13 passed / 57
  skipped (DB-gated integration suites skip without DATABASE_URL — unchanged
  from Bundle 4 baseline), web 17 (was 9; +8 new component tests across
  RecipeEditor, IngredientPicker, MealLibrary filters, MealLibrary search). All
  prior tests stay green.
- Build (`npm run build --workspace=@meal-tracking/web`): `tsc --noEmit` +
  `vite build` succeed (80+ modules transformed).
- Bundle Verify (component level; full e2e is Bundle 6): create/edit a recipe
  with USDA + custom ingredients and see live nutrition — servings 1->2 halves
  per-serving values via the shared engine (RecipeEditor test); the completeness
  indicator appears and unresolved lines are excluded, never shown as 0; the
  IngredientPicker renders USDA matches, pre-fills a confirmable gram weight,
  adds via snapshot, supports the custom path, and degrades to a clear message +
  custom entry on search error; tag/meal-type filters and the debounced search
  box drive the server-filtered list via the query key and render distinct
  empty states. Layout uses stacked/full-width controls usable at a phone
  viewport (NFR-2).

## Session Log

### 2026-05-30 — bundle complete
- Completed: STEP-36..43 (8/8) via TDD (failing test first, then impl).
- Decisions:
  - Added the nutrition-engine as a web workspace dependency (resolved to its
    `development`/source export, consistent with shared) so live nutrition is
    computed in the browser (AD-5), not via a server round-trip.
  - Engine `Nutrition` requires numeric macros; absent macros from the API read
    as 0 for the engine's arithmetic only. Completeness/S-6 is preserved at the
    display boundary (formatNutrition) and via the engine's micronutrient/
    unresolved-grams completeness flag, which the editor surfaces as the
    "incomplete" indicator. USDA Foundation foods carry the core macros.
  - On USDA select, the line uses unit `g` with the confirmed grams as the
    quantity against the ingredient's reference-grams nutrition basis (AD-4),
    so the engine factor is grams/referenceGrams.
  - Filters/search drive the `useRecipes` query KEY (q/mealType/tag) rather than
    client-side array filtering, so the UI always matches server results and
    caches per combination.
  - Mounted RecipeEditor in MealLibrary behind an "Add recipe" toggle so the
    Bundle-5 create -> live nutrition -> save -> appears-in-list flow is
    reachable end to end at the component level.
- Next: Bundle 6 — recipe-library e2e verification and any final wiring.
