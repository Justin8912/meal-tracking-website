# Progress: Bundle 1 — Plan Skeleton

> Tasks: spec-driven/weekly-planner/bundle-1.md | Bundle: 1 | Branch: impl/weekly-planner/bundle-1 | Last Updated: 2026-06-01

Progress: 6/6 steps complete

## Current State

- Stage: skeleton
- Last completed: STEP-6 — WeeklyPlanner Mon-Sun week grid + useWeekPlan query keyed by week
- Next up: Bundle 2 (plan CRUD / detail view) per the task decomposition
- Blockers: none

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-1 | done | 566f934 | Test-first: shared plan-entry Zod schema (XOR, dayOfWeek 0..6, mealSlot enum) |
| STEP-2 | done | 0a11f63 | Shared MealSlot/PlanEntry/PlanEntryInput/WeeklySummary types + mealSlotSchema/planEntryInputSchema (XOR .refine()) |
| STEP-3 | done | 0b70022 (test), 0ebd0ac (impl) | Migration 0003 plan_entries + Drizzle model (ON DELETE SET NULL, "not both" CHECK, day/slot CHECK, index) |
| STEP-4 | done | 22520c2 | Test-first: thin week list + add entry (Supertest) |
| STEP-5 | done | 5972039 | Thin POST /plans + GET /plans?weekStart= routes; server-side Monday normalization |
| STEP-6 | done | 20a0468 (test), fbafb88 (impl) | WeeklyPlanner view shell (Mon-Sun) + useWeekPlan query keyed ['plan', weekStart] |

Supporting commits (test-suite stability, surfaced while adding the planner DB tests; no test files changed):
- 352e445 — fix(api): pool error listener so async pg errors do not leak across files
- a4fb950 — fix(api): recreate the singleton DB pool if a prior afterAll close ended it

## Verification

- Per-workspace typecheck (`npx tsc --noEmit`): shared, nutrition-engine, api, web all exit 0.
- `npm test` with NO DATABASE_URL: shared 29, nutrition-engine 35, web 27 pass; all api DB tests (incl. the new plans 5 + migration-0003 9) skip gracefully — the default suite is green.
- `npm test` with a Dockerized postgres:16-alpine (migrations 0001+0002+0003 applied in lexical order by the existing runner): api 88 pass, shared 29, nutrition-engine 35, web 27.
- Bundle Verify (achieved):
  - POST /api/v1/plans for a week/day/slot returns 201 with the persisted entry; GET /api/v1/plans?weekStart= returns it from the DB keyed by the Monday DATE (`week_start_date`) — proven by `apps/api/src/routes/plans.test.ts`.
  - A mid-week weekStart normalizes to the same Monday on both POST and GET (AD-2, S-4).
  - The DB rejects a both-set row ("not both" CHECK) and the shared Zod schema rejects both-set and neither-set bodies (XOR, S-1) with a 400 envelope.
  - Deleting a referenced recipe leaves the entry as a tombstone (recipe_id NULL, ON DELETE SET NULL — AD-3), verified in `apps/api/src/db/migration-0003.test.ts`.
  - The Weekly Planner renders all seven days Monday..Sunday with the entry on its day, empty-day and loading states — proven by `apps/web/src/views/WeeklyPlanner.test.tsx`. The week-plan query key is `['plan', weekStart]` for Bundle 3 cache reuse — proven by `apps/web/src/query/plans.test.ts`.

## Limitations / Notes

- XOR vs. tombstone reconciliation (STEP-3): a strict DB XOR CHECK would reject the both-NULL tombstone that ON DELETE SET NULL produces, blocking the recipe delete and erasing planning history — the opposite of AD-3. The DB CHECK is therefore "not both" (`NOT (recipe_id IS NOT NULL AND freeform_title IS NOT NULL)`), which still rejects the both-set case (defence-in-depth, S-1); rejecting a neither-set row on INSERT is owned by the shared Zod schema at the API boundary (a post-deletion tombstone never passes through it). This is a deliberate, documented refinement of the bundle's "exactly one" CHECK wording so AD-3 and S-1 coexist.
- Pre-existing test-suite flake (not introduced here): the API integration suite shares one process-wide pg pool (`db/client.ts`), and each DB test file's `afterAll` calls `closeDb()` on that singleton while `fileParallelism:false` serializes only file start, not teardown. Adding the two new planner DB test files reshuffles vitest's file schedule and intermittently exposes this latent cross-file teardown race as an ECONNREFUSED in a recipe-library file (e.g. ingredients-snapshot / recipes-crud), never in the planner files. Two in-scope robustness fixes to the shared client (pool error listener + recreate-on-ended) reduced the rate substantially; a residual ~1-in-8 full-run flake remains. Fully eliminating it requires per-file pool isolation in the recipe-library test files, which is out of scope for this bundle (do not modify recipe-library). Re-running the suite passes; the planner tests themselves are deterministically green, and the default no-DB `npm test` is always green.
- Web lint: the repo-root `npm run lint` has a known pre-existing JSX-flag quirk on apps/web; the authoritative check used here is per-workspace `npx tsc --noEmit` (all clean).
- Scope: this bundle ships the thin add/list skeleton only. Full CRUD, week navigation/history, the detail view, dnd-kit edit mode, and the weekly nutrition summary land in later bundles. The WeeklySummary type and the planQueryKey/useWeekPlan hook are shaped now so those bundles extend rather than rewrite them.

## Session Log

### 2026-06-01 — Bundle 1 implemented (STEP-1..6)
- Completed: STEP-1..6 plus two supporting api test-stability fixes.
- Decisions: DB CHECK is "not both" rather than strict XOR so the ON DELETE SET NULL tombstone (AD-3) stays legal; Monday normalization computed server-side (and mirrored client-side) at UTC to avoid the ISO/year-boundary bug (F-11, S-4); week-plan query keyed `['plan', weekStart]` for Bundle 3 cache reuse (AD-4).
- Next: Bundle 2.
