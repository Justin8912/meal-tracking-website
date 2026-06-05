# Progress: Bundle 3 — Persistence Behavior

> Tasks: spec-driven/platform-foundation/tasks.md | Bundle: 3 | Started: 2026-05-30 | Last Updated: 2026-05-30

Progress: 4/4 steps complete

## Current State

- Stage: depth
- Last completed: STEP-19 — Persistence write helper with failure surfacing
- Next up: Bundle 4 (STEP-20+)
- Blockers: none

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-16 | done | a1e420e | Failing Supertest: GET /api/v1/units asserts the 7 seeded units from the DB, each validated by the shared Zod Unit schema, qty.gramsPerUnit null. Fails 404 before STEP-17. |
| STEP-17 | done | ce8fb08 | GET /api/v1/units reads units via Drizzle (not a constant), coerces numeric grams_per_unit (null stays null), validates the array through the shared Unit schema (S-3), registered under /api/v1 prefix (AC-1.2, AC-1.3). |
| STEP-18 | done | 769a00e | Failing integration tests for persist(): round-trip write (AC-1.1), typed PersistenceError on DB failure, and a forced failure routed through the real Fastify global handler -> 5xx shared envelope, no false success (AC-1.5). |
| STEP-19 | done | 9cd9844 | Generic workspace-scoped persist() over Drizzle: resolves workspace id server-side (AD-4), parameterized insert (S-4), returns committed row via RETURNING (AC-1.1); on any DB error throws PersistenceError (statusCode 500, code PERSISTENCE_FAILED) that the existing global handler (STEP-9) maps to the shared 5xx envelope (AC-1.5). server.ts already covered this path; no change needed there. |

## Bundle Verify

PASS (against compiled production JS, seeded Dockerized Postgres):
- `GET /api/v1/units` -> 200 with the 7 seeded units read from the DB (g, tsp, tbsp, fl oz, cup, quart, qty), `qty.gramsPerUnit` null. Validated by the shared Zod Unit schema.
- Forced save failure through persist() -> HTTP 500, `content-type: application/json`, body `{"error":{"code":"PERSISTENCE_FAILED","message":"An unexpected error occurred"}}` — shared error envelope, not a crash or HTML, no false success (AC-1.5).

## Test / Typecheck Results

- `npm run typecheck` (all workspaces: shared, api, web): clean.
- api suite with DATABASE_URL (Dockerized postgres:16-alpine on :55433, baseline migration applied): 16 passed (7 files), including the new units and persist integration tests.
- api suite without DATABASE_URL: DB-touching tests skip gracefully (4 passed | 12 skipped), consistent with bundle 1.
- Compiled-JS production path intact: `npm run build -w @meal-tracking/api` emits dist/routes/units.js and dist/db/persist.js; bundle-verify ran against the compiled output.

## Session Log

### 2026-05-30 — bundle 3 complete (STEP-16..19)
- Approach: TDD per step (failing test -> implementation). Reused the existing bundle 1-2 DB-integration pattern: disposable `postgres:16-alpine` on a test port with a TEST DATABASE_URL, baseline 0001_baseline.sql applied via the existing read path; tests skip gracefully when DATABASE_URL is unset.
- Decisions:
  - units route registered via a Fastify sub-scope with `prefix: /api/v1` (API_BASE_PATH); health stays unprefixed.
  - `numeric` grams_per_unit arrives from pg as a string; coerced to `number | null` (null preserved, no zero-fill, S-6) before shared-schema validation (S-3).
  - persist() is generic over workspace-scoped tables (type-enforced `workspaceId` column), sets the resolved workspace id itself (AD-4), and uses a parameterized Drizzle insert (S-4).
  - Failure surfacing reuses the existing STEP-9 global error handler unchanged: PersistenceError carries statusCode 500 + a stable code, so server.ts needed no modification.
- Next: Bundle 4.
