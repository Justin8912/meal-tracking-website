# Research Results: platform-foundation

Findings partitioned from the holistic `spec-driven/meal-tracking-mvp/design.md` (provided via `--context`) to the platform scope. No new research subagents were dispatched. See the holistic design's `references/research.md` for the original aspect-level detail.

---

## Aspect — Backend, deployment, persistence, and workspace foundation

### Findings

#### F-1: Node ~150MB image is acceptable; "space efficient" targets the data store
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-1, NFR-3
- A Go static binary is ~10-20MB vs Node ~150MB, but a ~150MB image is fine for a personal Docker deploy. "Space efficient" is read as referring to the Postgres data store (used regardless). The program chose Node/TS so the nutrition engine can be written once and shared (holistic AD-2).

#### F-2: Compose env/env_file are runtime; build ARG bakes secrets
- **Source**: web_research
- **Confidence**: high
- **Related**: NFR-2
- Docker Compose `environment:`/`env_file:` set container env vars at run time, never copied into image layers; build `ARG` can be baked into layers. Read DB creds from `process.env` at startup; gitignore `.env`.

#### F-3: Vite bakes env at build time; runtime injection required
- **Source**: web_research
- **Confidence**: high
- **Related**: NFR-2
- A static Vite build bakes `import.meta.env` at build time. The standard pattern is an entrypoint that envsubst-renders `env-config.js` (`window._env_ = { API_BASE_URL }`) from env vars before nginx serves the assets; the app reads `window._env_` at startup. No secret reaches the bundle.

#### F-4: Fastify + pino + Zod is a small, AI-friendly Node stack
- **Source**: web_research
- **Confidence**: medium
- **Related**: FR-1, NFR-4
- Fastify is lighter/faster than Express, ships pino structured logging (NFR-4), and pairs with Zod boundary validation. With the shared `packages/shared` types (AD-1), the contract stays consistent across web and api.

#### F-5: Hybrid Postgres schema via Drizzle + SQL migrations
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-1
- The program's schema stores macros as columns and micronutrients as JSONB (feature tables, added later). Drizzle ORM + drizzle-kit migrations are TS-first and lightweight (no heavy query-engine binary like Prisma), keeping the schema explicit. The foundation owns the baseline migration (workspaces + units + seed).

#### F-6: workspace_id FK + seeded default workspace = auth-ready
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-1, NFR-2
- Shared-schema multi-tenancy: a `workspace_id NOT NULL` FK on every owned table pointing at a seeded `workspaces` row. Adding users later is additive (create users + membership + user_id, optional RLS) with no backfill or constraint tightening — satisfying AC-1.4.

### Approaches Evaluated

**Preferred: Node + Fastify + TS on a multi-stage image, Postgres + Drizzle, Compose with runtime secrets.** Establishes the monorepo, baseline schema/seed, API skeleton with health + structured logging, static frontend with runtime env injection, and a 3-service Compose. Fits all platform NFRs. References: holistic design AD-1/2/3/4/11/12; https://fastify.dev/; https://orm.drizzle.team/; https://github.com/GoogleContainerTools/distroless

**Viable: Go backend (smaller image).** ~10-20MB but cannot share the TS nutrition engine with the browser — rejected program-wide.

**Not recommended: Local-first store + sync engine.** Cross-device sync via a CRDT/replication layer is large complexity unjustified for a single shared workspace MVP; request/response over Postgres suffices (AD-7).

### Resolved Uncertainties

| Question | Answer | Evidence |
| --- | --- | --- |
| Backend stack? | Node + Fastify + TS (engine sharing) | F-1; holistic AD-2 |
| Secrets without baking? | Runtime Compose env/env_file; never ARG | F-2 |
| Static frontend runtime API URL? | window._env_ + envsubst entrypoint | F-3 |
| Auth-ready without restructure? | workspace_id NOT NULL FK + seeded workspace | F-6 |
| Sync engine needed? | No — request/response over server storage for MVP | AD-7 |

### Remaining Uncertainties
- Managed-Postgres host/tier is a deployment-time choice (non-blocking).
