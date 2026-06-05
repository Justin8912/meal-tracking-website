# Standards Inventory: platform-foundation

No project-level `CLAUDE.md` exists yet (greenfield). Standards derive from the user's global `CLAUDE.md` conventions and the design's binding constraints. Promote durable conventions into a project `CLAUDE.md` as the codebase grows.

---

## S-1: Secrets come only from runtime environment variables
- **Domain**: security
- **File Type**: * (all)
- **Action Type**: * (all)
- **Source**: design constraint (NFR-2)

DB credentials (and later external API keys) are read from `process.env` at startup and supplied via Docker Compose `environment:`/`env_file:`. Never hardcode secrets, never use build `ARG`/`--build-arg` for secrets, never expose them to the frontend bundle. `.env` is gitignored; `.env.example` documents names only.

## S-2: Run lint before committing TypeScript/JavaScript
- **Domain**: other
- **File Type**: .ts, .tsx
- **Action Type**: * (all)
- **Source**: global `CLAUDE.md` (Code Change Workflow)

## S-3: Validate API inputs and outputs at the boundary with shared Zod schemas
- **Domain**: api-design
- **File Type**: .ts
- **Action Type**: create
- **Source**: AD-1, AD-2

Fastify routes validate against Zod schemas in `packages/shared`; the frontend imports the same schemas/types.

## S-4: Use Drizzle/parameterized queries; never concatenate SQL
- **Domain**: security
- **File Type**: .ts, .sql
- **Action Type**: * (all)
- **Source**: AD-3

## S-5: Schema changes go through versioned drizzle-kit migrations
- **Domain**: other
- **File Type**: .sql, .ts
- **Action Type**: create
- **Source**: AD-3

The foundation owns the baseline migration (workspaces + units + seed). Feature specs add tables in subsequent migrations; no out-of-band schema edits.

## S-6: No emojis
- **Domain**: other
- **File Type**: * (all)
- **Action Type**: * (all)
- **Source**: global `CLAUDE.md` (Behavior & Communication)
