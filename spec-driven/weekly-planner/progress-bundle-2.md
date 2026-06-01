# Progress: Bundle 2 — Plan Entry CRUD (recipe + freeform, XOR)

> Tasks: spec-driven/weekly-planner/bundle-2.md | Bundle: 2 | Branch: impl/weekly-planner/bundle-2 | Last Updated: 2026-05-30

Progress: 0/4 steps complete

## Current State

- Stage: depth
- Last completed: none
- Next up: STEP-7 — Test-first for freeform CRUD + save-failure
- Blockers: depends on Bundle 1 (plan_entries, thin routes, view shell)

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-7 | pending | — | Test-first: PUT/DELETE /plans/:id (freeform) + save-failure surfacing |
| STEP-8 | pending | — | Freeform add/edit/remove + save-failure (mutations, error envelope, no silent loss) |
| STEP-9 | pending | — | Test-first: recipe add + empty-day state |
| STEP-10 | pending | — | Recipe add to a day + empty-day add affordance |

## Verification

- Pending. Bundle Verify (target): add/edit/remove a freeform meal and add a recipe meal persist; a both-set body is rejected (400); empty days show an add state; a forced save failure shows an error without losing the plan.

## Limitations / Notes

- The recipe-only add path here is the non-DnD route; drag-to-assign is Bundle 5.

## Session Log

### 2026-05-30 — initialized
- Completed: none
- Decisions: none
- Next: STEP-7 (test-first for freeform CRUD + save-failure)
