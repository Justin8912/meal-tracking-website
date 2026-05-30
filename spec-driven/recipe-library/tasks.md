---
title: "Tasks: Recipe Library & Nutrition"
slug: recipe-library
status: final
design_source: spec-driven/recipe-library/design.md
design_hash: sha256:456dfea37eb3227fed50621f033f92ce714c40d0f725ac32233c38c3aa0ad70d
spec_source: spec-driven/recipe-library/spec.md
spec_hash: sha256:dd66dd7b91bcadef918f1675f76aa5e16a45d2fec0877bbc0950e4f47b4a8a9d
strategy: walking-skeleton
total_steps: 47
total_slices: 3
total_bundles: 6
validation: subagent
version: 2.0
date: 2026-05-29
---

# Tasks: Recipe Library & Nutrition

> Design: spec-driven/recipe-library/design.md | Spec: spec-driven/recipe-library/spec.md | Strategy: walking-skeleton | Generated: 2026-05-29 | Status: Final

> Do not edit this document after finalization. Track execution in `spec-driven/recipe-library/progress-bundle-N.md` files.
> Upstream dependency: `platform-foundation` (monorepo, packages/shared, DB baseline 0001 + units, Fastify skeleton + error envelope + workspace resolution) must be implemented first.

## Traceability

### Functional Requirements

| FR | AC | STEP | Slice | Bundle |
|----|-----|------|-------|--------|
| FR-1 | AC-1.1 | STEP-3, STEP-4, STEP-6, STEP-7, STEP-37 | Slice 1, Slice 2 | Bundle 1, Bundle 5 |
| FR-1 | AC-1.2 | STEP-29 | Slice 2 | Bundle 4 |
| FR-1 | AC-1.3 | STEP-29 | Slice 2 | Bundle 4 |
| FR-1 | AC-1.4 | STEP-29 | Slice 2 | Bundle 4 |
| FR-1 | AC-1.5 | STEP-29 | Slice 2 | Bundle 4 |
| FR-1 | AC-1.6 | STEP-29 | Slice 2 | Bundle 4 |
| FR-2 | AC-2.1 | STEP-19, STEP-23, STEP-39 | Slice 2 | Bundle 3, Bundle 5 |
| FR-2 | AC-2.2 | STEP-19, STEP-27 | Slice 2 | Bundle 3 |
| FR-2 | AC-2.3 | STEP-21, STEP-23, STEP-45 | Slice 2, Slice 3 | Bundle 3, Bundle 6 |
| FR-2 | AC-2.4 | STEP-23 | Slice 2 | Bundle 3 |
| FR-3 | AC-3.1 | STEP-25, STEP-39 | Slice 2 | Bundle 3, Bundle 5 |
| FR-3 | AC-3.2 | STEP-27, STEP-46 | Slice 2, Slice 3 | Bundle 3, Bundle 6 |
| FR-3 | AC-3.3 | STEP-25 | Slice 2 | Bundle 3 |
| FR-4 | AC-4.1 | STEP-11, STEP-17, STEP-46 | Slice 2, Slice 3 | Bundle 2, Bundle 6 |
| FR-4 | AC-4.2 | STEP-13, STEP-15 | Slice 2 | Bundle 2 |
| FR-4 | AC-4.3 | STEP-11 | Slice 2 | Bundle 2 |
| FR-4 | AC-4.4 | STEP-37 | Slice 2 | Bundle 5 |
| FR-4 | AC-4.5 | STEP-9, STEP-27 | Slice 2 | Bundle 2, Bundle 3 |
| FR-5 | AC-5.1 | STEP-31 | Slice 2 | Bundle 4 |
| FR-5 | AC-5.2 | STEP-33, STEP-41 | Slice 2 | Bundle 4, Bundle 5 |
| FR-5 | AC-5.3 | STEP-33, STEP-41 | Slice 2 | Bundle 4, Bundle 5 |
| FR-6 | AC-6.1 | STEP-35, STEP-43 | Slice 2 | Bundle 4, Bundle 5 |
| FR-6 | AC-6.2 | STEP-43 | Slice 2 | Bundle 5 |
| — | — | STEP-1, STEP-2, STEP-5, STEP-8, STEP-10, STEP-12, STEP-14, STEP-16, STEP-18, STEP-20, STEP-22, STEP-24, STEP-26, STEP-28, STEP-30, STEP-32, STEP-34, STEP-36, STEP-38, STEP-40, STEP-42, STEP-44, STEP-47 | — | — |

> MANUAL-trace STEPs: STEP-1 (package scaffold), STEP-44/47 (e2e/responsive verification) are infrastructure; the even-numbered STEPs in the 2–42 range are TDD test-first steps paired with their implementation STEPs. STEP-45 (USDA degradation e2e) and STEP-46 (accuracy verification) trace to ACs in their step bodies.

### Non-Functional Requirements

| NFR | Disposition | STEP / Mechanism | Verification |
|-----|-------------|------------------|-------------|
| NFR-1 (Performance/smoothness, accuracy-first) | Platform | Fastify request/response (platform AD-7); no latency cap on the engine — accuracy over speed | Manual: interactions feel smooth; engine has no enforced time budget |
| NFR-2 (Usability & mobile) | Implemented | STEP-37/STEP-41/STEP-43 responsive UI; STEP-47 mobile-viewport check | Verify clauses on STEP-47 (e2e at 390px) |
| NFR-3 (Nutrition accuracy) | Implemented | STEP-8–17 (engine, TDD) + STEP-46 (hand-verified accuracy suite) | Verify clauses on STEP-9/11/13/15 + STEP-46 (within tolerance, completeness not zero) |
| NFR-4 (External-API cost) | Implemented | STEP-19/STEP-21 USDA client + Postgres cache-aside; STEP-23 server-side key | Verify clauses on STEP-20/21 (cache hit, no redundant calls), STEP-23 (key not exposed) |
| NFR-5 (Reliability / USDA degradation) | Implemented | STEP-21 stale-on-outage + STEP-23 error envelope; STEP-45 outage e2e | Verify clauses on STEP-21, STEP-45 (clear error + custom fallback) |

## Slice 1: Walking Skeleton (Stage: skeleton)

> Prove a recipe can be created and listed end-to-end on the platform. STEP detail in bundle-1.md.

### Bundle 1: Recipe Skeleton
> Stage: skeleton | Parallel: no | Files: packages/nutrition-engine/*, packages/shared/src/*, apps/api/drizzle/0002_recipe_library.sql, apps/api/src/db/schema.ts, apps/api/src/routes/recipes.ts, apps/api/src/server.ts, apps/web/src/views/MealLibrary.tsx, apps/web/src/query/recipes.ts

**Bundle Verify**: A recipe can be created and listed end-to-end on the platform foundation.
- **Level**: integration
- **Given**: platform-foundation running with migration 0002 applied
- **Action**: POST a minimal recipe, GET /recipes, load the Meal Library view
- **Outcome**: the recipe persists, appears in the list, and renders in the view

## Slice 2: Feature Depth (Stage: depth)

> Feature areas: nutrition engine, USDA + ingredients, recipe CRUD/tags/search, library UI. STEP detail in bundle-2.md … bundle-5.md.

### Bundle 2: Nutrition Engine (TDD core)
> Stage: depth | Parallel: yes (file-disjoint; depends only on Bundle 1 shared types) | Files: packages/nutrition-engine/src/units.ts, compute.ts, format.ts, *.test.ts

**Bundle Verify**: The engine computes accurate per-recipe and per-serving nutrition for mixed-unit recipes with missing data.
- **Level**: unit
- **Given**: a hand-verified recipe (mixed g/cup/qty, 2 servings, one missing micronutrient)
- **Action**: computeRecipeNutrition(ingredients, servings)
- **Outcome**: macros + per-serving match within tolerance; micronutrients unioned; missing data flagged (not zero)

### Bundle 3: USDA Proxy & Ingredients
> Stage: depth | Parallel: no (shares routes/ingredients.ts, server.ts) | Files: apps/api/src/usda/client.ts, apps/api/src/routes/ingredients.ts, apps/api/src/server.ts

**Bundle Verify**: Ingredient search returns normalized USDA data via the server-side proxy, degrades on outage, and snapshots nutrition at add-time.
- **Level**: integration
- **Given**: api with a stubbed USDA upstream + seeded postgres
- **Action**: search, add an ingredient, repeat search with USDA failing
- **Outcome**: normalized cached results; added ingredient carries a snapshot; failed search serves stale or the error envelope (key never leaked)

### Bundle 4: Recipe CRUD, Tags & Search (API)
> Stage: depth | Parallel: no (extends routes/recipes.ts) | Files: apps/api/src/routes/recipes.ts, apps/api/src/routes/tags.ts, apps/api/src/server.ts

**Bundle Verify**: The recipe API supports full CRUD, tagging, tag/meal-type filtering, and name search, with validation and save-failure surfaced.
- **Level**: integration
- **Given**: api + seeded postgres with tagged recipes
- **Action**: update/delete a recipe; create/apply a tag; filter by tag+meal type; search; attempt an invalid save
- **Outcome**: CRUD persists; filters/search return correct subsets; invalid input → 400, save failure → 5xx envelope

### Bundle 5: Meal Library UI
> Stage: depth | Parallel: no (extends MealLibrary.tsx, query/recipes.ts) | Files: apps/web/src/components/RecipeEditor.tsx, IngredientPicker.tsx, apps/web/src/views/MealLibrary.tsx, apps/web/src/query/recipes.ts

**Bundle Verify**: A user can create/edit a recipe with USDA/custom ingredients and see live nutrition, then filter and search the library on mobile and desktop.
- **Level**: e2e
- **Given**: the API (Bundles 1,3,4) and engine (Bundle 2) running
- **Action**: open the editor, add a USDA + custom ingredient, adjust servings, then filter and search
- **Outcome**: nutrition updates live; filters/search narrow the list; layout usable at a phone viewport

## Slice 3: Integration (Stage: integration)

> End-to-end verification, USDA degradation, accuracy, and mobile. STEP detail in bundle-6.md.

### Bundle 6: Integration & Verification
> Stage: integration | Parallel: no | Files: apps/web/e2e/*, apps/api/test/*, packages/nutrition-engine/src/*.test.ts

**Bundle Verify**: The recipe library works end-to-end — accurate nutrition, graceful USDA degradation, and mobile usability.
- **Level**: e2e
- **Given**: the full stack running via docker compose
- **Action**: run the e2e suite (recipe→nutrition, USDA-outage) and the accuracy + responsive checks
- **Outcome**: all flows pass; nutrition matches hand-verified values within tolerance; UI usable at a phone viewport

## Conflict Analysis

> Note: Covers explicitly declared file paths only. Implicit touches (route registration in server.ts, package-lock.json, db/schema.ts model additions, barrel files) may require manual sequencing during execution.

| Hot File | Touched By | Strategy |
|----------|------------|----------|
| apps/api/src/routes/recipes.ts | STEP-6 (Bundle 1), STEP-29/33/35 (Bundle 4) | Sequential (Bundle 1 before Bundle 4) |
| apps/api/src/routes/ingredients.ts | STEP-23/25/27 (Bundle 3) | Same bundle — sequential within Bundle 3 |
| apps/api/src/server.ts | STEP-6 (Bundle 1), STEP-23 (Bundle 3) | Sequential; route registration — Bundle 1 creates, Bundle 3 appends |
| apps/api/src/db/schema.ts | STEP-4 (Bundle 1) | Single writer (Bundle 4 reads the models) |
| packages/nutrition-engine/src/compute.ts | STEP-11/13/15 (Bundle 2) | Same bundle — sequential within Bundle 2 |
| apps/web/src/views/MealLibrary.tsx | STEP-7 (Bundle 1), STEP-41/43 (Bundle 5) | Sequential (Bundle 1 before Bundle 5) |
| apps/web/src/query/recipes.ts | STEP-7 (Bundle 1), STEP-41 (Bundle 5) | Sequential (Bundle 1 before Bundle 5) |

> Bundle 2 (nutrition-engine) is file-disjoint from Bundles 3–5 and can run in parallel with them once Bundle 1 lands. Bundles 3, 4, 5 share api route files / web view files and run sequentially after Bundle 1.

## Architecture Decisions

See: spec-driven/recipe-library/design.md

## File Structure

    spec-driven/recipe-library/tasks.md        — this index
    spec-driven/recipe-library/bundle-1.md     — Recipe skeleton (STEP-1..7)
    spec-driven/recipe-library/bundle-2.md     — Nutrition engine, TDD (STEP-8..17)
    spec-driven/recipe-library/bundle-3.md     — USDA proxy & ingredients (STEP-18..27)
    spec-driven/recipe-library/bundle-4.md     — Recipe CRUD, tags & search API (STEP-28..35)
    spec-driven/recipe-library/bundle-5.md     — Meal Library UI (STEP-36..43)
    spec-driven/recipe-library/bundle-6.md     — Integration & verification (STEP-44..47)
    spec-driven/recipe-library/progress-bundle-N.md — per-bundle execution state
