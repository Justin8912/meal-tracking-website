---
title: "Tasks: Weekly Planner"
slug: weekly-planner
status: final
design_source: spec-driven/weekly-planner/design.md
design_hash: sha256:e3d0cb9351a8acbbf22ce3cfbee603babaa5c3660fae04b6b5f01c6b89af9345
spec_source: spec-driven/weekly-planner/spec.md
spec_hash: sha256:87f810c05fd6932272e0224f8f84ccb05a4576fbd6ec3829342f72c45a2530ac
strategy: walking-skeleton
total_steps: 27
total_slices: 3
total_bundles: 7
validation: subagent
version: 2.0
date: 2026-05-30
---

# Tasks: Weekly Planner

> Design: spec-driven/weekly-planner/design.md | Spec: spec-driven/weekly-planner/spec.md | Strategy: walking-skeleton | Generated: 2026-05-30 | Status: Final

> Do not edit this document after finalization. Track execution in `spec-driven/weekly-planner/progress-bundle-N.md` files.
> Upstream dependencies: `platform-foundation` (monorepo, packages/shared, DB baseline 0001 + units, Fastify skeleton + error envelope + workspace resolution, the `/planner` route shell) AND `recipe-library` (recipe tables in migration 0002, `GET /recipes` + `q`/`mealType`/`tag` filters, `GET /recipes/:id` with computed nutrition, the shared `packages/nutrition-engine`) must be implemented first.

## Traceability

### Functional Requirements

| FR | AC | STEP | Slice | Bundle |
|----|-----|------|-------|--------|
| FR-1 | AC-1.1 | STEP-6 | Slice 1 | Bundle 1 |
| FR-1 | AC-1.2 | STEP-2, STEP-3, STEP-5, STEP-10 | Slice 1, Slice 2 | Bundle 1, Bundle 2 |
| FR-1 | AC-1.3 | STEP-2, STEP-8 | Slice 1, Slice 2 | Bundle 1, Bundle 2 |
| FR-1 | AC-1.4 | STEP-8 | Slice 2 | Bundle 2 |
| FR-1 | AC-1.5 | STEP-10 | Slice 2 | Bundle 2 |
| FR-1 | AC-1.6 | STEP-8 | Slice 2 | Bundle 2 |
| FR-2 | AC-2.1 | STEP-16 | Slice 2 | Bundle 4 |
| FR-2 | AC-2.2 | STEP-16 | Slice 2 | Bundle 4 |
| FR-3 | AC-3.1 | STEP-5, STEP-12 | Slice 1, Slice 2 | Bundle 1, Bundle 3 |
| FR-3 | AC-3.2 | STEP-12 | Slice 2 | Bundle 3 |
| FR-3 | AC-3.3 | STEP-3, STEP-14 | Slice 1, Slice 2 | Bundle 1, Bundle 3 |
| FR-3 | AC-3.4 | STEP-12 | Slice 2 | Bundle 3 |
| FR-4 | AC-4.1 | STEP-18 | Slice 2 | Bundle 5 |
| FR-4 | AC-4.2 | STEP-18 | Slice 2 | Bundle 5 |
| FR-4 | AC-4.3 | STEP-20 | Slice 2 | Bundle 5 |
| FR-4 | AC-4.4 | STEP-20, STEP-24 | Slice 2, Slice 3 | Bundle 5, Bundle 7 |
| FR-5 | AC-5.1 | STEP-22 | Slice 2 | Bundle 6 |
| FR-5 | AC-5.2 | STEP-22 | Slice 2 | Bundle 6 |
| — | — | STEP-1, STEP-4, STEP-7, STEP-9, STEP-11, STEP-13, STEP-15, STEP-17, STEP-19, STEP-21, STEP-23, STEP-25, STEP-26, STEP-27 | — | — |

> MANUAL-trace STEPs: STEP-1/4/7/9/11/13/15/17/19/21 are TDD test-first steps paired with their immediately-following implementation STEPs (they inherit that STEP's trace). STEP-23/24/25/26/27 are Slice 3 integration/verification steps; they trace to the ACs named in their step bodies (STEP-24 -> AC-4.4; STEP-25 -> AC-3.1/3.3; STEP-26 -> AC-5.1/5.2).

### Non-Functional Requirements

| NFR | Disposition | STEP / Mechanism | Verification |
|-----|-------------|------------------|-------------|
| NFR-1 (Performance / smoothness of navigation + edits) | Implemented | STEP-6/STEP-12 TanStack Query keyed by `week_start_date` (AD-4); cached weeks render immediately; STEP-3 index on `(workspace_id, week_start_date)` | Verify clauses on STEP-12 (revisited week served from cache, no refetch flash); manual interaction feel |
| NFR-2 (Usability & mobile incl. touch drag-and-drop) | Implemented | STEP-20 dnd-kit touch activation + tap-to-assign fallback (AD-5); STEP-18 two-panel layout collapsing to a drawer; STEP-24/STEP-27 touch + 390px e2e | Verify clauses on STEP-20 (touch drag assigns), STEP-24 (touch emulation), STEP-27 (390px flows completable, WCAG basics) |

## Slice 1: Walking Skeleton (Stage: skeleton)

> Prove a week's plan can be created and listed end-to-end on the platform + recipe-library. STEP detail in bundle-1.md.

### Bundle 1: Plan Skeleton
> Stage: skeleton | Parallel: no | Files: packages/shared/src/types.ts, packages/shared/src/schemas.ts, apps/api/drizzle/0003_weekly_planner.sql, apps/api/src/db/schema.ts, apps/api/src/routes/plans.ts, apps/api/src/server.ts, apps/web/src/views/WeeklyPlanner.tsx, apps/web/src/query/plans.ts

**Bundle Verify**: A planned meal can be added to a day and the week listed end-to-end on the platform + recipe-library foundation.
- **Level**: integration
- **Given**: platform-foundation + recipe-library running (api + seeded postgres) with migration 0003 applied
- **Action**: POST a plan entry for a week/day/slot, GET /plans?weekStart=, load the Weekly Planner view
- **Outcome**: the entry persists, appears in the week response keyed by `week_start_date`, and the Mon-Sun week renders in the view

## Slice 2: Feature Depth (Stage: depth)

> Feature areas: plan entry CRUD (recipe + freeform, XOR + save-failure), week navigation/history, planned-meal detail, drag-and-drop edit mode, weekly nutrition summary. STEP detail in bundle-2.md … bundle-6.md.

### Bundle 2: Plan Entry CRUD (recipe + freeform, XOR)
> Stage: depth | Parallel: no (extends routes/plans.ts, WeeklyPlanner.tsx, query/plans.ts) | Files: apps/api/src/routes/plans.ts, apps/web/src/views/WeeklyPlanner.tsx, apps/web/src/query/plans.ts

**Bundle Verify**: A day's meal can be added (recipe or freeform), edited, and removed; the recipe/freeform XOR holds; an empty day shows an add state; a save failure surfaces an error and does not silently lose the plan.
- **Level**: integration
- **Given**: api + seeded postgres (migration 0003) and the skeleton view
- **Action**: add a freeform meal, edit it, remove it; add a recipe meal; attempt a both-recipe-and-freeform body; force a save failure
- **Outcome**: CRUD persists; the XOR body is rejected (400 envelope); the empty day shows an add affordance; the forced save failure shows an error (plan not lost)

### Bundle 3: Week Navigation & History
> Stage: depth | Parallel: no (extends WeeklyPlanner.tsx, query/plans.ts, routes/plans.ts) | Files: apps/web/src/views/WeeklyPlanner.tsx, apps/web/src/query/plans.ts, apps/api/src/routes/plans.ts

**Bundle Verify**: Navigating backward/forward loads the correct week by Monday DATE, past weeks retain their planned meals, and a failed week load shows an error with retry rather than a blank/stale week.
- **Level**: integration
- **Given**: api + seeded postgres with plans in multiple weeks (incl. a year-boundary week)
- **Action**: navigate to the previous and next week; revisit a past planned week; force a week load to fail
- **Outcome**: each week resolves by its Monday DATE; the past week's meals are intact; the failed load shows an error + retry (not blank/stale)

### Bundle 4: Planned-Meal Detail View
> Stage: depth | Parallel: yes (file-disjoint new component; depends on Bundle 1 view + recipe-library recipe read) | Files: apps/web/src/components/PlannedMealDetail.tsx, apps/web/src/views/WeeklyPlanner.tsx

**Bundle Verify**: Clicking a planned meal opens a detail showing notes and the link, and for a recipe-backed meal its nutrition is available from the detail.
- **Level**: integration
- **Given**: the week view with a freeform meal and a recipe-backed meal
- **Action**: click each planned meal
- **Outcome**: the detail shows notes + link (if present); for the recipe meal, its nutrition breakdown is available (read via recipe-library `GET /recipes/:id`)

### Bundle 5: Drag-and-Drop Edit Mode
> Stage: depth | Parallel: no (extends WeeklyPlanner.tsx; adds RecipePalette/WeekGrid) | Files: apps/web/src/components/RecipePalette.tsx, apps/web/src/components/WeekGrid.tsx, apps/web/src/views/WeeklyPlanner.tsx

**Bundle Verify**: Edit mode shows a filterable recipe palette (left) and the week (right); dragging a recipe onto a day assigns it; the assignment also works via a usable touch interaction (tap-to-assign fallback).
- **Level**: e2e
- **Given**: the API (Bundles 1-2) running with recipes available (recipe-library)
- **Action**: toggle edit mode, filter the palette by meal type/tag, drag a recipe onto a day, then assign via touch/tap on a narrow viewport
- **Outcome**: the edit layout appears; the palette narrows on filter; the dragged recipe is assigned to the day; touch/tap assignment works (NFR-2)

### Bundle 6: Weekly Nutrition Summary (Nice to Have)
> Stage: depth | Parallel: yes (file-disjoint new component + endpoint; depends on Bundle 1 schema/routes) | Files: apps/api/src/routes/plans.ts, apps/web/src/components/WeeklyNutritionSummary.tsx, apps/web/src/views/WeeklyPlanner.tsx, apps/web/src/query/plans.ts

**Bundle Verify**: The weekly summary aggregates macros only across the week's recipe-based meals and makes clear which meals (freeform / tombstones) are not counted.
- **Level**: integration
- **Given**: a week with recipe-based meals and at least one freeform meal
- **Action**: view the weekly summary
- **Outcome**: aggregated macros (calories/protein/carbs/fat/fiber) are shown; vitamins/minerals are not aggregated; the freeform meal is flagged as excluded

## Slice 3: Integration (Stage: integration)

> End-to-end plan-a-week, touch drag-and-drop, week history, weekly summary, and mobile responsiveness. STEP detail in bundle-7.md.

### Bundle 7: Integration & Verification
> Stage: integration | Parallel: no | Files: (verification — e2e/test specs) apps/web/e2e/*, apps/api/test/*

**Bundle Verify**: The weekly planner works end-to-end — plan a week, drag/tap recipes on touch, navigate history, see the weekly macro summary, all usable on a phone.
- **Level**: e2e
- **Given**: the full stack (platform + recipe-library + weekly-planner) running via docker compose
- **Action**: run the e2e suite (plan-a-week, touch drag-and-drop, week-history) plus the weekly-summary and 390px responsive checks
- **Outcome**: all flows pass; touch assignment works; history resolves by Monday DATE; the macro summary is correct with exclusions flagged; the UI is usable at a phone viewport

## Conflict Analysis

> Note: Covers explicitly declared file paths only. Implicit touches (route registration in server.ts, package-lock.json, db/schema.ts model additions, barrel files) may require manual sequencing during execution.

| Hot File | Touched By | Strategy |
|----------|------------|----------|
| apps/api/src/routes/plans.ts | STEP-5 (Bundle 1), STEP-8 (Bundle 2), STEP-12 (Bundle 3), STEP-22 (Bundle 6) | Sequential (Bundle 1 creates; 2/3 extend CRUD + history; 6 adds the summary endpoint, file-disjoint logic) |
| apps/api/src/server.ts | STEP-5 (Bundle 1) | Single writer (route registration; later bundles reuse the registered prefix) |
| apps/api/src/db/schema.ts | STEP-3 (Bundle 1) | Single writer (later bundles read the plan_entries model) |
| apps/web/src/views/WeeklyPlanner.tsx | STEP-6 (Bundle 1), STEP-8/10 (Bundle 2), STEP-12/14 (Bundle 3), STEP-16 (Bundle 4), STEP-18/20 (Bundle 5), STEP-22 (Bundle 6) | Sequential after Bundle 1; Bundles 2,3,5 extend the view in order; Bundles 4,6 add components mounted into it |
| apps/web/src/query/plans.ts | STEP-6 (Bundle 1), STEP-8 (Bundle 2), STEP-12 (Bundle 3), STEP-22 (Bundle 6) | Sequential (Bundle 1 creates the week-keyed hooks; later bundles add mutations / summary query) |
| packages/shared/src/types.ts, schemas.ts | STEP-2 (Bundle 1) | Single writer (the plan contract; later bundles import it) |

> Bundle 4 (detail view) and Bundle 6 (summary endpoint + component) are largely file-disjoint from the CRUD/navigation bundles and can run in parallel once Bundle 1 lands, except for their mount points in WeeklyPlanner.tsx (sequence those edits). Bundles 2, 3, 5 share routes/plans.ts and the planner view and run sequentially after Bundle 1.

## Architecture Decisions

See: spec-driven/weekly-planner/design.md

## File Structure

    spec-driven/weekly-planner/tasks.md        — this index
    spec-driven/weekly-planner/bundle-1.md     — Plan skeleton (STEP-1..6)
    spec-driven/weekly-planner/bundle-2.md     — Plan entry CRUD, recipe + freeform XOR (STEP-7..10)
    spec-driven/weekly-planner/bundle-3.md     — Week navigation & history (STEP-11..14)
    spec-driven/weekly-planner/bundle-4.md     — Planned-meal detail view (STEP-15..16)
    spec-driven/weekly-planner/bundle-5.md     — Drag-and-drop edit mode (STEP-17..20)
    spec-driven/weekly-planner/bundle-6.md     — Weekly nutrition summary (STEP-21..22)
    spec-driven/weekly-planner/bundle-7.md     — Integration & verification (STEP-23..27)
    spec-driven/weekly-planner/progress-bundle-N.md — per-bundle execution state
