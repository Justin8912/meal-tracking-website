---
title: "Tasks: Platform & Persistence Foundation"
slug: platform-foundation
status: final
design_source: spec-driven/platform-foundation/design.md
design_hash: sha256:3c1f1edd490c3c8e93880a74b6d16175079f646ee658964a79155c92fed8a6c6
spec_source: spec-driven/platform-foundation/spec.md
spec_hash: sha256:fb17811413883d036a356ede54663c49cd3dd5f8dafeb5bcc30c73cf949b1abc
strategy: walking-skeleton
total_steps: 21
total_slices: 3
total_bundles: 4
validation: subagent
version: 2.0
date: 2026-05-29
---

# Tasks: Platform & Persistence Foundation

> Design: spec-driven/platform-foundation/design.md | Spec: spec-driven/platform-foundation/spec.md | Strategy: walking-skeleton | Generated: 2026-05-29 | Status: Final

> Do not edit this document after finalization. Track execution in `spec-driven/platform-foundation/progress-bundle-N.md` files.

## Traceability

### Functional Requirements

| FR | AC | STEP | Slice | Bundle |
|----|-----|------|-------|--------|
| FR-1 | AC-1.1 | STEP-6, STEP-19 | Slice 1, Slice 2 | Bundle 1, Bundle 3 |
| FR-1 | AC-1.2 | STEP-12, STEP-17 | Slice 1, Slice 2 | Bundle 2, Bundle 3 |
| FR-1 | AC-1.3 | STEP-17 | Slice 2 | Bundle 3 |
| FR-1 | AC-1.4 | STEP-3, STEP-7, STEP-11, STEP-21 | Slice 1, Slice 3 | Bundle 1, Bundle 4 |
| FR-1 | AC-1.5 | STEP-5, STEP-9, STEP-19 | Slice 1, Slice 2 | Bundle 1, Bundle 3 |
| — | — | STEP-1, STEP-2, STEP-4, STEP-8, STEP-10, STEP-13, STEP-14, STEP-15, STEP-16, STEP-18, STEP-20 | — | — |

> MANUAL-trace STEPs: STEP-1 (scaffold), STEP-13/14/15 (containerization), STEP-20 (e2e verification) are infrastructure; STEP-2/4/8/10/16/18 are TDD test-first steps paired with their implementation STEPs.

### Non-Functional Requirements

| NFR | Disposition | STEP / Mechanism | Verification |
|-----|-------------|------------------|-------------|
| NFR-1 (Performance/smoothness) | Platform | Fastify low-overhead request/response (AD-7); no sync engine | Manual: interactions feel smooth; no blocking calls in the hot path |
| NFR-2 (Security & auth-readiness) | Implemented | STEP-5 (env-only secrets), STEP-7/STEP-21 (workspace_id FK + seed), STEP-13/14/15 (no build-ARG secrets, runtime env), STEP-12 (no secrets in bundle) | Verify clauses on STEP-5, STEP-15 (inspection), STEP-21 (inspection) |
| NFR-3 (Cost) | Deferred | Hosting/Postgres tier is a deployment-time choice; image kept lean via multi-stage builds (STEP-13/14) | Out of scope for this iteration — selected at deploy time |
| NFR-4 (Operability) | Implemented | STEP-9 (pino structured logs + /healthz), STEP-15 (pg_isready healthcheck gating) | Verify clauses on STEP-9 (/healthz 200/503), STEP-15 (compose healthcheck) |

## Slice 1: Walking Skeleton (Stage: skeleton)

> Proves web→api→postgres→/healthz runs end-to-end. STEP detail in bundle-1.md and bundle-2.md.

### Bundle 1: Backend Skeleton
> Stage: skeleton | Parallel: no | Files: package.json, tsconfig.base.json, packages/shared/src/*, apps/api/src/*, apps/api/drizzle/0001_baseline.sql

**Bundle Verify**: The API skeleton starts, connects to Postgres, and reports health end-to-end.
- **Level**: integration
- **Given**: Postgres running with the baseline migration applied, API started with DB env vars
- **Action**: `GET /healthz`
- **Outcome**: 200 `{ "status": "ok" }` when DB reachable; 503 with error envelope when down

### Bundle 2: Frontend & Deployment Skeleton
> Stage: skeleton | Parallel: no (compose depends on Bundle 1 images) | Files: apps/web/*, apps/api/Dockerfile, docker-compose.yml, .env.example, .dockerignore, .gitignore

**Bundle Verify**: The full stack runs from a single `docker compose up`, web shell served and reaching the API.
- **Level**: integration
- **Given**: `docker compose up` with a valid `.env`
- **Action**: load the web root and observe the network call to the API
- **Outcome**: SPA loads, reads `window._env_.API_BASE_URL`, a request reaches the API; no secrets in any client asset

## Slice 2: Persistence Depth (Stage: depth)

> FR-1 persistence behavior. STEP detail in bundle-3.md.

### Bundle 3: Persistence Behavior
> Stage: depth | Parallel: no | Files: apps/api/src/routes/units.ts, apps/api/src/db/persist.ts, apps/api/src/server.ts

**Bundle Verify**: Server-side data round-trips through the API and persistence failures surface as a clean error.
- **Level**: integration
- **Given**: API + seeded Postgres running
- **Action**: `GET /api/v1/units`, then exercise a write through the persistence helper with the DB made to fail
- **Outcome**: units read returns seeded data; a forced save failure returns a 5xx error envelope

## Slice 3: Integration (Stage: integration)

> Wires the stack and verifies end-to-end + auth-readiness. STEP detail in bundle-4.md.

### Bundle 4: Wire & Verify
> Stage: integration | Parallel: no | Files: (verification only) docker-compose.yml, apps/api/drizzle/0001_baseline.sql

**Bundle Verify**: The full foundation runs end-to-end and the data model is auth-ready.
- **Level**: integration
- **Given**: `docker compose up` with a valid `.env`
- **Action**: load the web shell, confirm `/healthz`, call `/api/v1/units` through nginx→api→postgres
- **Outcome**: SPA loads and reaches the API; units return seeded data; baseline shows workspace_id scoping + seeded workspace

## Conflict Analysis

> Note: Covers explicitly declared file paths only. Implicit touches (route registration in server.ts, package-lock.json, barrel files) may require manual sequencing during execution.

| Hot File | Touched By | Strategy |
|----------|------------|----------|
| apps/api/src/server.ts | STEP-9 (Bundle 1), STEP-19 (Bundle 3) | Sequential (Bundle 1 before Bundle 3) — STEP-19 wires the persist error path into the handler created in STEP-9 |
| apps/api/drizzle/0001_baseline.sql | STEP-7 (Bundle 1), STEP-21 (Bundle 4, inspect-only) | Sequential; STEP-21 inspects, does not rewrite |
| docker-compose.yml | STEP-15 (Bundle 2), STEP-20 (Bundle 4, run-only) | Sequential; STEP-20 runs compose, does not edit |
| .gitignore | STEP-15 (Bundle 2) | Single writer; also touched by prior commits — append-only |

> Implicit: new routes register in `apps/api/src/server.ts` (STEP-9 creates it; STEP-17 and STEP-19 register into it) — keep route registration edits sequential within their bundles.

## Architecture Decisions

See: spec-driven/platform-foundation/design.md

## File Structure

    spec-driven/platform-foundation/tasks.md        — this index
    spec-driven/platform-foundation/bundle-1.md     — Backend skeleton (STEP-1..11)
    spec-driven/platform-foundation/bundle-2.md     — Frontend & deployment skeleton (STEP-12..15)
    spec-driven/platform-foundation/bundle-3.md     — Persistence behavior (STEP-16..19)
    spec-driven/platform-foundation/bundle-4.md     — Wire & verify (STEP-20..21)
    spec-driven/platform-foundation/progress-bundle-N.md — per-bundle execution state
