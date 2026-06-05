# Progress: Bundle 4 — Planned-Meal Detail View

> Tasks: spec-driven/weekly-planner/bundle-4.md | Bundle: 4 | Branch: impl/weekly-planner/bundle-4 | Last Updated: 2026-06-01

Progress: 2/2 steps complete

## Current State

- Stage: depth
- Last completed: STEP-16 — PlannedMealDetail (notes/link + recipe nutrition) wired into WeeklyPlanner
- Next up: Bundle complete
- Blockers: none

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-15 | done | 58ee663 | Test-first (PlannedMealDetail.test.tsx): freeform detail shows title/description/link, link omitted when absent (AC-2.1); recipe detail shows recipe notes/link + per-serving nutrition composed via the shared engine, asserted equal to formatNutrition (never hardcoded), incomplete data flagged not zeroed (S-5); tombstone (recipe_id NULL) shows "recipe removed" and issues no recipe fetch (AD-3). Failed before STEP-16 (component absent). |
| STEP-16 | done | 3aa4223 | PlannedMealDetail branches freeform / recipe-backed / tombstone (AD-3). Recipe-backed reads GET /recipes/:id (useRecipeDetail) for notes/link and joins it to GET /ingredients (useIngredients) per-referenceGrams nutrition to build engine NutritionLines, feeds computeRecipeNutrition, renders ONLY through formatNutrition (S-5) with the completeness flag surfaced; no new API endpoint (AD-4). Clicking a meal in WeeklyPlanner toggles its detail. WeeklyPlanner.detail.test.tsx covers the Bundle Verify integration. |

## Verification

- Per-workspace typecheck (`npx tsc --noEmit`): shared, nutrition-engine, api, web all exit 0.
- `npm test` with NO DATABASE_URL (default): web 17 files / 47 tests pass (incl. the new PlannedMealDetail.test.tsx 6 + WeeklyPlanner.detail.test.tsx 2); nutrition-engine 6 files, shared 3 files pass; api 3 files / 13 tests pass + 22 DB files / 84 tests skip gracefully. Full suite green.
- New tests: `apps/web/src/components/PlannedMealDetail.test.tsx` (6, unit) and `apps/web/src/views/WeeklyPlanner.detail.test.tsx` (2, integration). All prior workspaces remain green (no regression).
- Bundle Verify (achieved): clicking a planned meal opens a detail showing notes + link, and for a recipe-backed meal its nutrition is available from the detail.
  - Freeform: clicking the meal opens a region (aria-label "Meal detail") showing the entry's title/description and the link only when present; an absent link renders no anchor (AC-2.1). Proven by both test files.
  - Recipe-backed: the detail reads GET /recipes/:id for notes/link and surfaces a per-serving nutrition breakdown computed CLIENT-SIDE via the shared nutrition-engine (recipe usage joined to GET /ingredients nutrition, the canonical reload flow), rendered only through formatNutrition and flagged incomplete when an ingredient omits a macro (AC-2.2, S-5). No new API endpoint (AD-4). Proven by PlannedMealDetail.test.tsx (engine-equality assertion) and WeeklyPlanner.detail.test.tsx (292 kcal/serving end-to-end via the grid).
  - Tombstone (recipe_id NULL, no freeform): shows "recipe removed", no nutrition, no recipe fetch (AD-3). Proven by PlannedMealDetail.test.tsx.

## Limitations / Notes

- The design (design.md AD-4 / Q-7) described the detail as reading "GET /recipes/:id which computes nutrition through the shared engine". In the actual recipe-library, GET /recipes/:id (RecipeDetail) returns ingredient USAGE only (ingredientId/quantity/unitCode + name) and defers nutrition to the client (recipe-library never computes nutrition server-side). The detail therefore composes nutrition exactly as RecipeEditor and the recipe-library e2e reload test do: GET /recipes/:id (usage) joined to GET /ingredients (per-referenceGrams nutrition + conversions) and fed to the shared engine. This honors "compose recipe-library + shared engine client-side, no new endpoint" (task scope) and matches the established codebase pattern; it is a clarification of the design's wording, not a deviation from its intent (no duplicated nutrition logic, one source of recipe truth).
- Rounding lives only in the engine's formatNutrition; the component never rounds and never zero-fills (it surfaces the engine's completeness flag, reusing toEngineNutrition/absentMacrosOf from query/ingredients.ts). An ingredient referenced by a recipe but missing from GET /ingredients is dropped from the engine lines and flags the recipe incomplete rather than understating the total.
- New query hooks added (web only): useRecipeDetail (['recipe', id], enabled only for a recipe-backed entry) in query/recipes.ts and useIngredients (['ingredients']) in query/ingredients.ts. No API, shared, or nutrition-engine changes.
- WeeklyPlanner change is limited to the documented mount point: the meal label became a toggle button (aria-expanded) that opens/closes the inline PlannedMealDetail; existing edit/remove affordances unchanged. File-disjoint from the CRUD/navigation bundles otherwise.
- Web lint: the repo-root `npm run lint` has a known pre-existing JSX-flag quirk on apps/web; the authoritative check used here is per-workspace `npx tsc --noEmit` (all clean). The pre-existing api pg-pool cross-file teardown race (out of scope) was not exercised — this bundle adds no DB tests; the default no-DB suite is green.

## Session Log

### 2026-06-01 — Bundle 4 implemented (STEP-15..16)
- Completed: STEP-15 (failing tests) and STEP-16 (implementation), TDD per step.
- Decisions: composed recipe nutrition client-side by joining GET /recipes/:id usage to GET /ingredients nutrition through the shared engine (the canonical reload flow), since recipe-library defers nutrition to the client — no new endpoint (AD-4); rendered nutrition only via formatNutrition with the completeness flag surfaced (S-5); detail branches freeform / recipe-backed / tombstone (AD-3); wired a toggle button on each planned meal in WeeklyPlanner to open the inline detail (FR-2).
- Next: Bundle complete; proceed to the next bundle per the task decomposition.
