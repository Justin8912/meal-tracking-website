# Progress: Bundle 2 — Nutrition Engine (TDD core)

> Tasks: spec-driven/recipe-library/tasks.md | Bundle: 2 | Started: 2026-05-29 | Last Updated: 2026-05-30

Progress: 10/10 steps complete

## Current State

- Stage: depth
- Last completed: STEP-17 — display formatting (single rounding boundary)
- Next up: bundle complete; enables STEP-37, STEP-46 (downstream UI/API)
- Blockers: none

The pure, dependency-free nutrition engine (S-1) is complete: per-`referenceGrams`
macro scaling and per-serving division (STEP-9/11), absolute-mass micronutrient
union (STEP-13), a completeness descriptor that surfaces missing data without
zero-filling (STEP-15), and a display-only rounding boundary (STEP-17). All 27
engine tests pass; full `npm test` and `npm run typecheck` are green across every
workspace with no regression to platform-foundation or recipe-library bundle-1.

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-8 | done | 8ae1170 | Test-first unit-to-grams conversion (failing) |
| STEP-9 | done | 5bda3bb | toGrams: per-ingredient gram-equivalents, flagged on missing |
| STEP-10 | done | 8fb2e50 | Test-first macro scaling + per-serving (failing) |
| STEP-11 | done | 3e210f8 | computeRecipeNutrition macro path + per-serving |
| STEP-12 | done | 0f3f1b0 | Test-first micronutrient union (failing) |
| STEP-13 | done | 78c0a35 | Micronutrient absolute-mass union |
| STEP-14 | done | 57764d5 | Test-first completeness + Bundle Verify recipe (failing) |
| STEP-15 | done | 4db0038 | Completeness descriptor (no zero-fill) |
| STEP-16 | done | 17c5ea4 | Test-first display formatting (failing) |
| STEP-17 | done | c62b721 | formatNutrition single rounding boundary |

## Bundle Verify

Hand-verified recipe in `src/completeness.test.ts`: oats 150 g, milk 2 cup
(@244 g/cup, per-ingredient gram-equivalent), egg 2 qty (@50 g) with an EMPTY
micronutrient map; 2 servings. Tolerance: +/-1 kcal, +/-0.5 g on macros.
- Total macros match the hand-verified expectation
  ({cal 931.46, p 54.542, c 124.55, f 24.73, fib 15.9}); per-serving = total / 2.
- Micronutrients summed as a union ({iron 7.05 mg, calcium 610 mg}); egg's empty
  map adds nothing.
- The egg (missing micronutrients) is flagged in `completeness.missing` with
  reason `missing-micronutrients` while its macros are still counted — confirming
  no zero-fill and no over-eager exclusion.

## Session Log

### 2026-05-29 — initialized
- Completed: none
- Decisions: none
- Next: STEP-8 — Test-first unit conversion

### 2026-05-30 — STEP-8..13 implemented
- Completed: STEP-8, STEP-9 (units.ts), STEP-10, STEP-11 (compute.ts macros),
  STEP-12, STEP-13 (micronutrient union). All TDD: failing test committed before
  each implementation.
- Decisions: per-ingredient gram-equivalents (no global unit table, F-4);
  full-precision accumulation, no mid-sum rounding (F-5); micronutrients as
  absolute mass (mg/mcg), never %DV.
- Next: STEP-14 — Test-first completeness.

### 2026-05-30 — STEP-14..17 implemented (bundle complete)
- Completed: STEP-14, STEP-15 (completeness descriptor), STEP-16, STEP-17
  (format.ts display rounding). TDD throughout.
- Decision (RESOLVED completeness semantics — authoritative): the bundle text's
  "exclude flagged ingredients from sums" is split into two distinct gaps because
  they have different computability:
  - **unresolved-grams**: `toGrams` cannot resolve grams (e.g. a volume unit with
    no per-ingredient gram-equivalent). The line's contribution genuinely cannot
    be computed, so it is EXCLUDED from BOTH macro and micronutrient sums and
    recorded in `completeness.missing` with reason `unresolved-grams: <toGrams
    reason>` (the offending unit is included via the toGrams message).
  - **missing-micronutrients**: the line resolves to grams but carries an empty
    (or partial) micronutrient map. Its macros (and any micros it does have)
    STILL contribute to the sums; the absent micronutrients are simply never
    added (no zero-fill, S-6). Recorded with reason `missing-micronutrients` so
    the recipe is flagged incomplete.
  - `completeness.complete` is `true` IFF `completeness.missing` is empty.
  - This interpretation keeps the STEP-10/11 macro tests (empty-micros
    ingredients still contribute macros) and the STEP-12/13 union tests passing.
- Rounding policy (STEP-17, single boundary, S-6): kcal integer, grams one
  decimal, mcg integer, mg/other-units one decimal; `formatNutrition` returns a
  new `FormattedNutrition` and never mutates its input.
- Verify: full `npm test` green — nutrition-engine 27, shared 22, web 9,
  api 4 passed + 19 skipped (DB-integration, skipped without a database,
  unchanged from baseline). `npm run typecheck` exit 0 across all workspaces.
- Next: bundle complete.
