# Progress: Bundle 6 — Weekly Nutrition Summary (Nice to Have)

> Tasks: spec-driven/weekly-planner/bundle-6.md | Bundle: 6 | Branch: impl/weekly-planner/bundle-6 | Last Updated: 2026-06-01

Progress: 2/2 steps complete

## Current State

- Stage: depth
- Last completed: STEP-22 — GET /plans/summary endpoint + WeeklyNutritionSummary UI
- Next up: none (bundle complete)
- Blockers: none

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-21 | done | b480b3e | Test-first (Supertest, DB skip-graceful): macro totals within tolerance; unrounded sum != sum-of-pre-rounded (F-20); no micros aggregated; freeform + tombstone excluded; weekStart normalized/validated |
| STEP-22 | done | 520a967 | GET /plans/summary (macros only, summed UNROUNDED via shared engine, rounded once); useWeeklySummary hook; WeeklyNutritionSummary component (totals + named "not counted" list); mounted in WeeklyPlanner; weeklySummarySchema added to shared (S-1) |

## Verification

- Bundle Verify PASS: the weekly summary aggregates macros only (calories/protein/carbs/fat/fiber) across the week's recipe-based meals via the shared nutrition-engine on UNROUNDED per-serving values (rounded once at display, F-20/S-5); vitamins/minerals are not aggregated (AC-5.1); freeform meals and recipe tombstones are flagged as excluded by name, never zero-counted (AC-5.2).
- STEP-21 Verify: tests fail before STEP-22 (endpoint 404) — confirmed.
- STEP-22 Verify: STEP-21 tests pass; macro totals match the hand-computed sum-of-unrounded-per-serving; an explicit test asserts the endpoint uses the unrounded sum (26.8) rather than the sum of pre-rounded displays (26.9), proving F-20; the freeform + tombstone ids appear in excludedEntryIds.
- Typecheck (per-workspace `npx tsc --noEmit`): shared, nutrition-engine, api, web — all clean.
- Tests: api 26 files / 102 tests pass with DATABASE_URL (Dockerized postgres:16-alpine); web 21 files / 61 tests pass; default no-DB `npm test` green with DB suites skipping gracefully (incl. plans-summary). `vite build` succeeds. No prior-bundle regressions.

## Decision: server-side summary (not client-side)

The bundle steps (STEP-21/22), AD-6, and contracts.md all specify a server endpoint `GET /plans/summary` that aggregates server-side via the shared engine. Implemented as the endpoint accordingly. The server reuses the SAME shared `nutrition-engine` composition pattern as the client-side PlannedMealDetail (recipe ingredient usage joined to per-`referenceGrams` ingredient nutrition), so the summary cannot drift from the per-meal detail's nutrition. No new heavy/duplicated nutrition logic was introduced.

## Limitations / Notes

- FR-5 is Nice to Have — a single behavioral step (lighter coverage than the Must-Have FRs).
- %DV/micronutrients are not summable across ingredients with differing reference amounts, hence macros-only (AD-6/F-20).
- Weekly-level completeness is out of scope for this Nice-to-Have: a recipe-backed entry whose ingredients cannot be fully computed still contributes its computable macros (the engine excludes only unresolvable lines, never zero-filling) and remains counted. Only freeform/tombstone entries (which carry NO nutrition) are flagged excluded, per AC-5.1/AC-5.2.
- Known pre-existing (out of scope, not fixed): a shared pg-pool cross-file teardown race can intermittently log ECONNREFUSED in an unrelated DB test file in the full DB run; never in the default no-DB `npm test`; green on re-run.

## Session Log

### 2026-06-01 — bundle complete
- Completed: STEP-21 (b480b3e), STEP-22 (520a967)
- Decisions: server-side `GET /plans/summary` per the bundle steps/AD-6/contracts; reuse shared engine to avoid drift; macros-only; sum unrounded, round once.
- Next: none (bundle complete)
