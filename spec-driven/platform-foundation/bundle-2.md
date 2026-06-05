# Bundle 2: Frontend & Deployment Skeleton

> Slice 1: Walking Skeleton (Stage: skeleton)
> Stage: skeleton | Parallel: no (compose depends on Bundle 1 images) | Files: apps/web/*, apps/api/Dockerfile, docker-compose.yml, .env.example, .dockerignore, .gitignore

**Bundle Verify**: The full stack runs from a single `docker compose up`, with the web shell served and able to reach the API.
- **Level**: integration
- **Given**: `docker compose up` with a valid `.env` (DB creds, API_BASE_URL)
- **Action**: load the web root in a browser and observe the network call to the API
- **Outcome**: the SPA loads, reads `window._env_.API_BASE_URL`, and a request reaches the API (e.g. `/healthz` green); no secrets present in any client asset

> **Context**
>
> **Applicable ACs**
> - **AC-1.2**: Given: data saved on one device / When: I open the app on another device / Then: I see the same data
>
> **Architecture Decisions**
> - **AD-5: Static frontend image with runtime env injection** — Decision: multi-stage Vite→nginx; entrypoint renders `window._env_ = { API_BASE_URL }` via envsubst at start; SPA history fallback; env-config.js served no-cache. Rationale: one immutable image, runtime-configurable API URL, no secret in bundle.
> - **AD-6: Docker Compose topology with runtime-only secrets** — Decision: web+api+postgres; secrets via Compose environment/env_file (gitignored .env), never build ARG; pg_isready healthcheck gates the API. Rationale: runtime secrets stay out of image layers; healthcheck gating.
>
> **Findings**
> - **F-3: Vite bakes env at build; runtime injection needed** — `window._env_` + envsubst entrypoint injects the API URL at runtime; no secret reaches the bundle.
> - **F-2: Compose env/env_file are runtime; ARG bakes secrets** — read secrets from env at runtime; never build ARG; gitignore `.env`.
> - **F-1: Node ~150MB image acceptable** — multi-stage build keeps the API image reasonable.
>
> **Standards**
> - **S-1**: Secrets only from runtime env vars; never hardcoded or in build ARG (Domain: security | File Type: *)
> - **S-6**: No emojis (Domain: other | File Type: *)
>
> **Constraints**
> - Vite bakes import.meta.env at build time → runtime injection required (Category: compatibility | Source: technical)
> - Secrets only via runtime env vars; never build ARG (Category: security | Source: technical)
>
> **Risks**
> - Stale `env-config.js` cached pins an old API URL (Impact: medium | Mitigation: serve env-config.js no-cache)
> - Secrets baked into an image or committed `.env` (Impact: high | Mitigation: runtime env only; gitignore `.env`; no build ARG)

#### STEP-12: Web shell (router, API client, runtime config)
[FR-1 -> AC-1.2] | create `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/router.tsx`, `apps/web/src/api/client.ts`, `apps/web/public/env-config.template.js` | Effort: M

> **Intent**: The API client must read its base URL from `window._env_.API_BASE_URL` at runtime, NOT from `import.meta.env` (which Vite bakes at build time — F-3). `index.html` must load `env-config.js` BEFORE the bundle so `window._env_` is defined when the client initializes; loading it after (or bundling the URL) breaks runtime configurability and the cross-device contract (the same image must point at the right API anywhere). No secret is referenced here.
> **Standards**: S-1 (no secrets in client), S-6

- Create `index.html` that loads `/env-config.js` before the app bundle
- Create `env-config.template.js` with `window._env_ = { API_BASE_URL: "${API_BASE_URL}" }`
- Implement the API client reading `window._env_.API_BASE_URL`
- Set up React Router with two placeholder tab views (Library, Planner) for feature specs to fill
- Mount the app in `main.tsx`

**Verify**:
- Level: integration | Given: `window._env_ = { API_BASE_URL: "http://x" }` injected | Action: initialize the API client | Outcome: requests target `http://x`, not a build-time-baked value
- Level: inspection | Given: the built bundle | Action: grep for any secret/DB value | Outcome: none present (only API_BASE_URL via window._env_)

> Depends on: STEP-1 | Enables: STEP-13 | Parallel with: STEP-14

#### STEP-13: Frontend Dockerfile, entrypoint, nginx config
MANUAL -> Containerize the SPA with runtime env injection (AD-5)

> **Intent**: The entrypoint must run envsubst over `env-config.template.js` to produce `env-config.js` from the container's env vars BEFORE nginx starts — so the same image takes its API URL at runtime (F-3). nginx must serve `env-config.js` with `no-cache` (else a cached copy pins a stale API URL — a listed risk) and provide SPA history fallback (`try_files ... /index.html`) so client routes don't 404.

- Multi-stage Dockerfile: stage 1 `vite build`; stage 2 nginx copies `dist`
- `docker-entrypoint.sh`: envsubst the template → `env-config.js`, then start nginx
- `nginx.conf`: SPA history fallback; `env-config.js` served `no-cache`
- No secrets baked; only runtime env (API_BASE_URL)

**Verify**:
- Level: integration | Given: the web image run with `API_BASE_URL=http://api:3000` | Action: fetch `/env-config.js` from the container | Outcome: contains the injected URL and is served with no-cache headers
- Level: inspection | Given: the built image | Action: inspect layers/history | Outcome: no secret values baked in

> Depends on: STEP-12 | Enables: STEP-15 | Parallel with: —

#### STEP-14: API Dockerfile (multi-stage)
MANUAL -> Containerize the Fastify API (AD-2, AD-6)

> **Intent**: A multi-stage build keeps the runtime image lean (F-1) and must NOT use build `ARG` for secrets — DB creds and any keys arrive only at runtime via Compose env (F-2, S-1). Baking a secret into a build arg persists it in image layers.
> **Standards**: S-1

- Multi-stage: build TS → run with production deps only
- Run migrations on start or via an entrypoint command (document which)
- No secrets via ARG; read all config from runtime env

**Verify**:
- Level: inspection | Given: the built API image | Action: inspect build args and layers | Outcome: no secrets in args/layers; the image starts and reads config from runtime env

> Depends on: STEP-1 | Enables: STEP-15 | Parallel with: STEP-12

#### STEP-15: Docker Compose topology and env scaffolding
MANUAL -> Compose web+api+postgres with runtime secrets and healthcheck (AD-6)

> **Intent**: `postgres` must declare a `pg_isready` healthcheck and `api` must `depends_on` it with `condition: service_healthy` — otherwise the API starts before Postgres accepts connections and crashes on boot. Secrets come from `env_file: .env` (gitignored), never build args (F-2, S-1). `.env.example` documents variable names with no real values.
> **Standards**: S-1, S-6

- `docker-compose.yml`: services `web`, `api`, `postgres`; api `depends_on` postgres `service_healthy`; postgres healthcheck `pg_isready`
- Wire secrets via `env_file: .env` / `environment:` (no build ARG)
- Create `.env.example` (names only), `.dockerignore`; add `.env` to `.gitignore`

**Verify**:
- Level: integration | Given: a valid `.env` | Action: `docker compose up` | Outcome: postgres becomes healthy, then api starts and `/healthz` returns 200; `.env` is gitignored
- Level: inspection | Given: docker-compose.yml | Action: review | Outcome: no secrets are passed as build args; all via env_file/environment

> Depends on: STEP-13, STEP-14 | Enables: STEP-20 | Parallel with: —
