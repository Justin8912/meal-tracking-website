# Progress: Bundle 2 — Frontend & Deployment Skeleton

> Tasks: spec-driven/platform-foundation/tasks.md | Bundle: 2 | Started: 2026-05-30 | Last Updated: 2026-05-30

Progress: 4/4 steps complete

## Current State

- Stage: skeleton
- Last completed: STEP-15 — Docker Compose topology with runtime-only secrets
- Next up: Bundle complete. Downstream: STEP-20 (feature specs build on this skeleton).
- Blockers: none

The full walking skeleton runs from `docker compose up`: postgres becomes healthy,
the API applies the baseline migration and serves `/healthz` (200, DB ping), and the
web SPA is served by nginx with `env-config.js` injected at runtime (no-cache). The
API client reads `window._env_.API_BASE_URL` at runtime; no secret is present in any
client asset, image layer, or build ARG.

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-12 | done | 1431a4b | Vite+React+TS shell; API client reads window._env_ (not import.meta.env); router with Library/Planner placeholders; Vitest unit test proves runtime-URL targeting + error envelope. |
| STEP-13 | done | 1f1392c | Multi-stage Vite->nginx; docker-entrypoint.sh envsubst -> env-config.js before nginx; nginx SPA fallback + env-config.js no-cache; no secrets baked. |
| STEP-14 | done | 3969a8d | Multi-stage Node build; production deps only (npm ci --omit=dev); runs as node user; entrypoint migrates then starts; all config from runtime env, no build ARG; tsx promoted to a runtime dependency. |
| STEP-15 | done | 8284539 | Compose web+api+postgres; pg_isready healthcheck; api depends_on service_healthy; secrets via env_file/.env (gitignored), never build ARG; .env.example names only. |

## Verification Summary

- Typecheck: PASS across all workspaces (shared, api, web).
- `vite build`: PASS (web bundle built; no secret/DB values present, only API_BASE_URL via window._env_).
- `npm test`: PASS (shared 10, api 4 with 8 DB-dependent tests skipped per Bundle 1 design, web 5).
- STEP-12 verify: with `window._env_={API_BASE_URL:"http://x"}` injected, the API client targets `http://x/healthz` (runtime, not build-time-baked). Built bundle grep: no secret/DB values (a `password` match is React DOM's input-type table, not a secret).
- STEP-13 verify: web image run with `API_BASE_URL=http://api:3000` served `/env-config.js` containing the injected URL with `Cache-Control: no-store, no-cache, must-revalidate`; SPA fallback returns index.html; `nginx -t` OK; image history shows no secrets/ARGs; template file removed at start.
- STEP-14 verify: API image history and `Config.Env` carry no secrets/config/build ARGs; container fails fast (`DATABASE_URL is required`) when the var is absent, confirming runtime-env config.
- STEP-15 verify (FULL `docker compose up`): postgres reached `healthy`, then api started, applied `0001_baseline.sql`, listened on :3000, and `/healthz` returned `200 {"status":"ok"}` end to end. Web served the SPA + injected no-cache env-config.js; SPA fallback `/library` returned 200; no secret/DB value found in any served client asset. `docker-compose.yml` passes no build args. Stack torn down with `docker compose down -v`.

## Limitations / Notes

- The sandbox resolves npm packages through a private Artifactory registry behind a
  corporate TLS-intercepting proxy, so a clean `docker build` of the committed
  Dockerfiles (which target the public registry) fails inside the build container
  with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. All Docker verification therefore used
  gitignored `*.verify` overlays that (a) injected the host corporate CA bundle via
  `NODE_EXTRA_CA_CERTS` and (b) mounted the private-registry `.npmrc` as a BuildKit
  secret (`--mount=type=secret`, never baked into a layer). The committed
  Dockerfiles, compose file, and entrypoints are unmodified by this workaround and
  are correct for a normal (public-registry) network. All verify artifacts were
  removed after teardown; their names remain in `.gitignore` as a guard.
- tsx is the API runtime (a production dependency) because the `@meal-tracking/shared`
  workspace package exports raw TypeScript (Bundle 1). This avoids transpiling/
  publishing shared separately; type safety is enforced by `npm run typecheck` (run
  inside the API build stage and in CI).

## Session Log

### 2026-05-30 — implemented STEP-12..15
- Completed: STEP-12 (1431a4b), STEP-13 (1f1392c), STEP-14 (3969a8d), STEP-15 (8284539).
- Decisions: split vitest config from vite config to avoid a dual-vite type clash;
  promoted tsx to an API runtime dependency; bumped react-router-dom to 6.30.3 and
  vite to 6.4.2 to clear the high-severity audit advisory (remaining 4 moderate are
  the esbuild dev-server advisory in Bundle-1's drizzle-kit, out of scope).
- Verification: typecheck + tests green; `vite build` clean; full `docker compose up`
  reached `/healthz` 200 with runtime-injected env-config.js and no secrets anywhere.
- Next: Bundle 2 complete.

### 2026-05-30 — production-correctness fix: compile shared+api to JS, drop tsx from runtime
- Converted `@meal-tracking/shared` and `@meal-tracking/api` to compiled-JS packages (tsc emit to dist/ via tsconfig.build.json); shared exports now expose compiled `dist/index.js`/types with a `development` condition resolving to TS source for in-repo dev/typecheck/Vitest; API `start`/`migrate` run `node dist/server.js`/`node dist/db/migrate.js`; tsx demoted to a devDependency (no longer a runtime dep); Dockerfile is now multi-stage build->compile->prune with a tsx-free runtime image; entrypoint runs compiled JS. Verified typecheck + tests green (shared 10, api 4+8 skip, web 5), `docker compose up` reached `/healthz` 200 with PID 1 = `node dist/server.js` and no tsx in the image (build used the gitignored *.verify proxy/CA + npmrc-secret overlay; token confirmed absent from image layers).
