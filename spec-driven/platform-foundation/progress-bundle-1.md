# Progress: Bundle 1 — Backend Skeleton

> Tasks: spec-driven/platform-foundation/tasks.md | Bundle: 1 | Started: 2026-05-30 | Last Updated: 2026-05-30

Progress: 11/11 steps complete

## Current State

- Stage: skeleton
- Last completed: STEP-11 — server-side workspace resolution helper
- Next up: Bundle 2 (frontend, Dockerfiles, docker-compose) — out of scope for this bundle
- Blockers: none

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-1 | done | aa42513 | npm-workspaces root + tsconfig.base (strict) + shared/api/web stubs |
| STEP-2 | done | 7feb75e | failing Vitest for shared schemas |
| STEP-3 | done | bb7381d | Workspace/Unit/ErrorEnvelope types + Zod schemas; 10 tests pass |
| STEP-4 | done | 0fbc64d | failing Vitest for env loader |
| STEP-5 | done | d1416b6 | config/env.ts fail-fast loader (S-1); .env.example; 4 tests pass |
| STEP-6 | done | 8690e8e | Drizzle schema (workspaces, units) + pooled client; SELECT-1 passes |
| STEP-7 | done | 82bc86b | 0001_baseline.sql: 1 workspace (fixed UUID) + 7 units (qty NULL), idempotent; 3 tests pass |
| STEP-8 | done | f00180b | failing Supertest for /healthz |
| STEP-9 | done | 3c56130 | Fastify + pino + error envelope + /healthz 200/503; 2 tests pass |
| STEP-10 | done | 0d44675 | failing Vitest for workspace resolution |
| STEP-11 | done | bd851bd | resolveWorkspaceId() seam (AD-4); 2 tests pass |

> Follow-up fix cbd2a46: pg CommonJS default-import interop so the server starts under tsx ESM at runtime (found during Bundle Verify).

## Verification Summary

- `npm test` (root, no DATABASE_URL): shared 10/10 pass; api 4 pure-unit pass, 8 DB tests skip gracefully.
- `npm test` with TEST DATABASE_URL (Dockerized postgres:16-alpine on :55432): api 12/12 pass.
- `npm run typecheck`: both workspaces clean (TS strict).
- Bundle Verify (live server against Postgres with baseline applied):
  - DB reachable -> `GET /healthz` 200 `{"status":"ok"}` (structured pino JSON logs).
  - DB unreachable -> `GET /healthz` 503 `{"error":{"code":"DB_UNAVAILABLE","message":"Database is not reachable"}}` (application/json, not HTML/stack).

## Session Log

### 2026-05-29 — initialized
- Completed: none
- Decisions: none
- Next: STEP-1: Monorepo scaffold

### 2026-05-30 — bundle implemented (TDD)
- Completed: STEP-1 through STEP-11 (all done).
- Tooling: pinned patched dep versions (fastify 5.8.5, drizzle-orm 0.45.2, drizzle-kit 0.31.10, vitest 3.2.4, tsx 4.22.3) to clear high/critical npm-audit advisories; 4 moderate dev-only esbuild advisories remain (acceptable).
- DB tests run against a disposable Docker postgres:16-alpine; they skip gracefully when DATABASE_URL is unset so the build is never broken without Docker.
- Decisions: server.ts exposes a buildServer({databaseUrl}) factory with a per-server pool so Supertest can inject reachable/unreachable DBs; DEFAULT_WORKSPACE_ID constant kept in sync with the baseline seed; resolveWorkspaceId() isolated as the future auth seam (AD-4).
- Fix: pg is CommonJS — switched to default import (cbd2a46) after the live server failed to start under tsx ESM.
- Next: Bundle 2 (apps/web app, Dockerfiles, docker-compose) — not in this bundle.
