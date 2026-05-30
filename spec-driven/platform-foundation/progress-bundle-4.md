# Progress: Bundle 4 — Wire & Verify

> Tasks: spec-driven/platform-foundation/tasks.md | Bundle: 4 | Started: 2026-05-30 | Last Updated: 2026-05-30

Progress: 2/2 steps complete

## Current State

- Stage: integration
- Last completed: STEP-21 — Auth-ready data model inspection
- Next up: Bundle 4 complete (platform-foundation done)
- Blockers: none

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-20 | done | 7ba40f7 | Repeatable, network-tolerant smoke script (`scripts/smoke.sh`, `npm run smoke`): `docker compose up --build` -> postgres healthy, api applies baseline 0001 + starts (compiled JS), `/healthz` 200, web serves SPA + `env-config.js` (injected API_BASE_URL, no-cache), `/api/v1/units` returns 7 seeded units through nginx->api->postgres; `docker compose down -v` on exit. Skips with a clear message when Docker/registry unavailable. |
| STEP-21 | done | (this commit) | Inspection of `0001_baseline.sql`: one seeded default workspace with fixed UUID, idempotent re-apply, no auth tables, additive future-auth seam (`resolveWorkspaceId()`). Verified live (psql double-apply + existing `baseline.test.ts`/`workspace.test.ts` against a disposable postgres). No code change needed; the baseline + tests already encode the guarantee. |

## Bundle Verify

PASS — full `docker compose up` (compiled-JS api, nginx-served SPA, seeded Postgres):

| Check | Result |
|-------|--------|
| postgres becomes healthy | PASS (Compose healthcheck gate; api waits `service_healthy`) |
| api applies baseline 0001 + starts (compiled JS) | PASS (`Applying migration 0001_baseline.sql` in api logs; `node dist/server.js`) |
| `GET /healthz` returns 200 | PASS |
| web serves SPA + `env-config.js` (injected API_BASE_URL, no-cache) | PASS (`Cache-Control: no-store, no-cache, must-revalidate`; body has API_BASE_URL) |
| `GET /api/v1/units` returns 7 seeded units through the stack | PASS (7 unit codes incl. `qty`, through nginx->api->postgres) |

Torn down with `docker compose down -v`.

## STEP-21 Inspection Findings (AC-1.4 / AD-4 / F-6)

- **One seeded workspace, fixed UUID.** `0001_baseline.sql` seeds exactly one row into `workspaces` with the well-known UUID `00000000-0000-0000-0000-000000000001` (`name='Default'`). Verified live: after applying the baseline twice, `count(workspaces)=1` and the id is unchanged.
- **Stable UUID, shared constant.** That UUID is mirrored in `apps/api/src/constants.ts` (`DEFAULT_WORKSPACE_ID`); feature migrations and the resolver reference the constant rather than re-deriving an id. `workspace.test.ts` asserts `resolveWorkspaceId()` returns this stable id.
- **Idempotent seed.** Tables use `CREATE TABLE IF NOT EXISTS`; seed rows use `ON CONFLICT DO NOTHING`. Re-running the baseline (psql double-apply and the `baseline.test.ts` idempotency case) adds no duplicate workspace or unit rows.
- **No auth tables yet (deferred).** Only `workspaces` and `units` exist in `public`; there are no `users`/`accounts`/`sessions`/`auth` tables. Confirmed via `information_schema.tables`.
- **Adding auth later is additive (no backfill).** The `workspace_id NOT NULL` FK convention (AD-4) plus a pre-existing seeded workspace mean a future migration can add a `users` table and a nullable-then-populated `user_id`/owner column without rewriting existing rows: owned rows already carry a valid `workspace_id`, so no data backfill is required (F-6, AC-1.4).
- **Future-auth seam documented.** `apps/api/src/workspace.ts::resolveWorkspaceId(db)` is the single server-side place that decides which workspace a request operates on (AD-4, STEP-11). Today it resolves the seeded default; when auth lands it is the only function that changes (derive workspace/user from a token) — not a cross-route refactor.

## Test / Typecheck Results

- `npm run typecheck` (shared, api, web): clean.
- `npm test` without `DATABASE_URL`: shared green, api 4 passed | 12 skipped (DB-touching tests skip gracefully), web 5 passed. No regression vs bundles 1-3.
- DB-backed verification (disposable `postgres:16-alpine`, baseline applied): `baseline.test.ts` (3) + `workspace.test.ts` (2) all pass — exactly one workspace with the known UUID, 7 units (qty grams NULL), idempotent re-apply, and the resolver returns the stable seeded id.

## Limitations / Notes

- **Sandbox proxy.** The sandbox resolves npm packages through a private Artifactory registry behind a corporate TLS-intercepting proxy, so a clean `docker build` of the committed Dockerfiles (public registry) fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. As in Bundle 2, verification used gitignored `*.verify` overlays that inject the host CA bundle via `NODE_EXTRA_CA_CERTS` and mount the authenticated `.npmrc` as a BuildKit secret (never baked into a layer). This bundle adds `Dockerfile.web.verify` (mirrors `apps/web/Dockerfile` with the same plumbing) so the web image can also build behind the proxy; `docker-compose.verify.yml` now builds both api and web with their verify Dockerfiles. `scripts/smoke.sh` auto-layers `docker-compose.verify.yml` when present and otherwise builds the committed Dockerfiles unchanged.
- **Committed files stay correct for a normal network.** `scripts/smoke.sh`, `docker-compose.yml`, `apps/*/Dockerfile`, and entrypoints are correct for a normal public-registry build; the `*.verify` artifacts are gitignored and were not committed. The smoke script is network-tolerant: it SKIPs with a clear message (exit 0) when Docker is unavailable or a build cannot reach the registry, consistent with the DB-skip-gracefully pattern.

## Session Log

### 2026-05-30 — bundle 4 complete (STEP-20, STEP-21)

- **STEP-20 (7ba40f7):** Added `scripts/smoke.sh` (+ `npm run smoke`) as the repeatable e2e artifact. Ran the full stack via `docker compose up --build` (with the gitignored verify overlay in-sandbox): postgres healthy -> api migrate+start (compiled JS) -> `/healthz` 200 -> web SPA + no-cache `env-config.js` with injected API_BASE_URL -> `/api/v1/units` 7 seeded units through nginx->api->postgres. All five checks PASS; stack torn down with `docker compose down -v`. Added `Dockerfile.web.verify` to `.gitignore` and extended `docker-compose.verify.yml` to build web with proxy plumbing (the web build also runs `npm ci`).
- **STEP-21 (this commit):** Inspection-only, no source change — the existing baseline + tests already encode AC-1.4. Confirmed live against a disposable postgres: applying `0001_baseline.sql` twice leaves exactly one workspace (`00000000-0000-0000-0000-000000000001`) and 7 units; no auth/user tables exist; `resolveWorkspaceId()` is the documented additive future-auth seam. Findings recorded above.
- **Decisions:** Treat STEP-21 as verification rather than adding a redundant test — `baseline.test.ts` already asserts single-workspace, stable UUID, and idempotency under the DB-skip-gracefully pattern; adding another would duplicate coverage. Re-used the established `*.verify` overlay approach for the Docker build and added the missing web counterpart so the smoke test exercises the real nginx->api path.
- **Next:** platform-foundation complete.
