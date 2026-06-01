# Progress: Bundle 6 — Weekly Nutrition Summary (Nice to Have)

> Tasks: spec-driven/weekly-planner/bundle-6.md | Bundle: 6 | Branch: impl/weekly-planner/bundle-6 | Last Updated: 2026-05-30

Progress: 0/2 steps complete

## Current State

- Stage: depth
- Last completed: none
- Next up: STEP-21 — Test-first for the weekly macro summary + exclusions
- Blockers: depends on Bundle 1 (schema/routes) + recipe-library shared nutrition-engine

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-21 | pending | — | Test-first: macro totals within tolerance; no micros aggregated; freeform excluded |
| STEP-22 | pending | — | GET /plans/summary (macros only, unrounded via shared engine) + UI + excluded flag |

## Verification

- Pending. Bundle Verify (target): weekly summary aggregates macros only across recipe-based meals; vitamins/minerals not aggregated; freeform meals flagged as excluded.

## Limitations / Notes

- FR-5 is Nice to Have — single behavioral step (lighter coverage than the Must-Have FRs).
- %DV/micronutrients are not summable across ingredients, hence macros-only (AD-6/F-20).

## Session Log

### 2026-05-30 — initialized
- Completed: none
- Decisions: none
- Next: STEP-21 (test-first for the summary)
