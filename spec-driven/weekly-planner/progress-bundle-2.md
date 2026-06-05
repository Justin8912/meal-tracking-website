# Progress: Bundle 2 — Plan Entry CRUD (recipe + freeform, XOR)

> Tasks: spec-driven/weekly-planner/bundle-2.md | Bundle: 2 | Branch: impl/weekly-planner/bundle-2 | Last Updated: 2026-06-01

Progress: 4/4 steps complete

## Current State

- Stage: depth
- Last completed: STEP-10 — recipe add to a day + empty-day state
- Next up: Bundle 3 (week navigation / history) per the task decomposition
- Blockers: none

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-7 | done | 96bfed1 | Test-first: Supertest PUT/DELETE /plans/:id (freeform edit/delete/XOR-400/5xx-failure/404) + WeeklyPlanner save-failure web test |
| STEP-8 | done | f7e0f25 | PUT /plans/:id + DELETE /plans/:id (workspace-scoped Drizzle, Zod XOR on edit, PersistenceError->5xx); useSavePlanEntry/useDeletePlanEntry mutations; day-cell freeform add/edit form + remove; "change not saved" surfacing keeps the in-progress entry (AC-1.6) |
| STEP-9 | done | 3bc9751 | Test-first: WeeklyPlanner recipe-add (recipe-only POST body) + every-empty-day empty/add state |
| STEP-10 | done | c8b43cd | DayRecipeForm recipe-select add path reusing GET /recipes (useRecipes); recipe-only entry POSTed to the chosen day (AC-1.2); explicit empty/add state per day (AC-1.5) |

## Verification

- Per-workspace typecheck (`npx tsc --noEmit`): shared, nutrition-engine, api, web all exit 0.
- `npm test` with NO DATABASE_URL: nutrition-engine 35, shared 29, web 30 pass; api 13 pass + 82 DB tests skip gracefully (24 files incl. the new plans-crud) — the default suite is green.
- `npm test` with a Dockerized postgres:16-alpine (migrations 0001+0002+0003 applied in lexical order): api 24 files / 95 tests pass (incl. the 7 new plans-crud DB tests), shared 29, nutrition-engine 35, web 30. The combined full-monorepo run flaked twice (3 ECONNREFUSED failures in one unrelated api file) out of ~10 runs and was green on re-run; 5 consecutive combined runs and every isolated api run were clean. This is the pre-existing cross-file teardown race documented in Bundle 1 (out of scope here); the plans/plans-crud tests are deterministically green.
- Bundle Verify (achieved):
  - A day's meal can be added (freeform via the day-cell form, or recipe via the recipe-select path), edited, and removed — freeform edit/delete persistence proven end-to-end by `apps/api/src/routes/plans-crud.test.ts`; the recipe-only add (recipeId set, no freeform fields) proven by `apps/web/src/views/WeeklyPlanner.recipe.test.tsx`.
  - The recipe/freeform XOR holds: a both-set PUT body is rejected with a 400 envelope (shared Zod refine, S-1), mutating nothing — `apps/api/src/routes/plans-crud.test.ts`.
  - An empty day shows a clear empty/add state ("No meals planned" + Add meal / Add recipe), distinct from loading — every-empty-day count asserted in `apps/web/src/views/WeeklyPlanner.recipe.test.tsx` (AC-1.5).
  - A save failure surfaces an error and does not silently lose the plan: a forced DB write failure on PUT returns a 5xx envelope, never a false success, and the original entry is untouched (`plans-crud.test.ts`); the UI shows a "change not saved" message and KEEPS the typed in-progress entry (`apps/web/src/views/WeeklyPlanner.crud.test.tsx`) (AC-1.6).

## Limitations / Notes

- The recipe-add path here is the non-DnD route (a per-day recipe `<select>` + slot); drag-to-assign is Bundle 5.
- Inline edit applies to freeform entries; recipe-backed entries and tombstones are display-only with a Remove action in this bundle (a recipe entry can be removed and re-added, or replaced via PUT — which is covered by the API and exercised by `plans-crud.test.ts`'s freeform->recipe switch test).
- PUT fully replaces both recipe/freeform sides, so editing a freeform meal into a recipe meal (or vice-versa) clears the other side — the XOR is preserved on every edit (S-1 + the DB "not both" CHECK).
- Pre-existing test-suite flake (NOT introduced here): the api integration suite shares one process-wide pg pool with a latent cross-file teardown race that can surface as ECONNREFUSED in an unrelated DB file (~1-in-8 only in the full combined `npm test` with DATABASE_URL set; never in the default no-DB run, never in the plans files). Re-running is green. Fully fixing it requires per-file pool isolation in the recipe-library test files (out of scope for this bundle).
- Web lint: the repo-root `npm run lint` has a known pre-existing JSX-flag quirk on apps/web; the authoritative check used here is per-workspace `npx tsc --noEmit` (all clean).

## Session Log

### 2026-06-01 — Bundle 2 implemented (STEP-7..10)
- Completed: STEP-7..10 (TDD: failing test, then impl, per step).
- Decisions: reused the recipe-library recipes.ts CRUD conventions (workspace-scoped Drizzle writes, PersistenceError -> shared 5xx envelope via the global handler); PUT re-normalizes weekStart to the Monday server-side (AD-2) and re-validates the XOR (S-1); mutations invalidate the `['plan']` query prefix (AD-4); save failures keep the in-progress entry visible rather than clearing it (AC-1.6); recipe-add choices come from the recipe-library GET /recipes (useRecipes), not a new endpoint.
- Next: Bundle 3.
