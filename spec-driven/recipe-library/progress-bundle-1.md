# Progress: Bundle 1 — Recipe Skeleton

> Tasks: spec-driven/recipe-library/bundle-1.md | Bundle: 1 | Branch: impl/recipe-library/bundle-1 | Last Updated: 2026-05-30

Progress: 7/7 steps complete

## Current State

- Stage: skeleton
- Last completed: STEP-7 — Meal Library view shell wired to the list
- Next up: Bundle 2 (nutrition-engine logic)
- Blockers: none

The recipe-library walking skeleton is proven on the platform foundation: a
recipe can be created and listed end-to-end (web -> api -> postgres), migration
0002 extends baseline 0001 with the full recipe schema, and the Meal Library
view renders the list via TanStack Query keyed for later reuse.

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-1 | done | `966fada` | Scaffold packages/nutrition-engine (zero runtime deps, AD-1/S-1); engine logic is Bundle 2 |
| STEP-2 | done | `3f1ba1c` | Failing shared recipe/ingredient/Nutrition schema tests (test-first) |
| STEP-3 | done | `7f176a4` | Shared types + Zod schemas: servings int>=1, meal_type enum, ingredient quantity+unit, micronutrient absolute-mass map (S-3) |
| STEP-4 | done | `0b5c036` | Migration 0002 extending baseline 0001 + Drizzle models; CHECK/FK constraints; indexes (S-4/S-5) |
| STEP-5 | done | `acb56c5` | Failing thin recipe create/list Supertest (test-first) |
| STEP-6 | done | `16ce457` | POST/GET /api/v1/recipes (Zod-validated, workspace-scoped, persisted-row round-trip) |
| STEP-7 | done | `468d6a4` | useRecipes TanStack Query hook (structured key `['recipes', filters]`) + MealLibrary list/loading/empty states |

Supporting commit: `0413350` — `fileParallelism:false` in apps/api/vitest.config.ts
(integration files share one Postgres via the singleton pool) and
`--passWithNoTests` for the engine scaffold (tests arrive in Bundle 2).

## Verification

- Per-workspace typecheck: all four workspaces clean.
- Tests (Dockerized postgres:16-alpine, DATABASE_URL set): nutrition-engine 0
  (passWithNoTests), shared 22, api 23 (incl. 7 recipe-library integration),
  web 9 (incl. query-key + MealLibrary render) = 54 pass. Without DATABASE_URL
  the api integration tests skip gracefully.
- Migration runner: `tsx src/db/migrate.ts` applies 0001 then 0002 in order
  ("Applied 2 migration(s).").
- Bundle verify (end-to-end): running server on the migrated DB — POST
  /api/v1/recipes (minimal valid body) -> 201 with the persisted recipe
  (server id + timestamps); GET /api/v1/recipes -> the recipe read from the DB,
  workspace-scoped. Web render covered by the MealLibrary component test
  (renders the recipe; empty list shows the empty state).
- No platform regression: /healthz, /api/v1/units, and baseline/persist/
  workspace tests stay green; shared prod dist rebuilds from source intact.

## Limitations / Notes

- Test DB: disposable `docker run` postgres:16-alpine (cached image) on port
  55432; the public-registry image was already cached so no CA-overlay build was
  needed. Tests skip gracefully without DATABASE_URL.
- Root `npm run lint` runs `tsc --noEmit -p tsconfig.base.json`, which sweeps web
  `.tsx` without the `--jsx` flag and errors — a PRE-EXISTING platform condition
  (fails identically at prior commit `0aefe4a`, before this bundle), not
  introduced here. The authoritative per-workspace `typecheck` is clean.

## Session Log

### 2026-05-30 — Bundle 1 implemented
- Completed: STEP-1..7 (TDD per step) + test-infra fix.
- Decisions: direct workspace-scoped Drizzle insert in the recipes route
  instead of the generic persist() helper (the helper's generic Omit type does
  not surface the recipes table's nullable optional columns); scoping +
  parameterization + PersistenceError surfacing preserved. Serialized api
  integration test files (shared singleton-pool Postgres).
- Next: Bundle 2 (nutrition-engine logic).
