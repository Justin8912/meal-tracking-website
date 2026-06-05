# Standards Inventory: meal-tracking-mvp

No project-level `CLAUDE.md` exists (greenfield). These standards are derived from the user's global `CLAUDE.md` conventions and from the design's binding technical constraints. As the codebase grows, promote durable conventions into a project `CLAUDE.md`.

---

## S-1: Secrets come only from runtime environment variables

- **Domain**: security
- **File Type**: * (all)
- **Action Type**: * (all)
- **Source**: design constraint (deploy call-outs 1+2, NFR-4)

DB credentials and `USDA_API_KEY` must be read from `process.env` at startup and supplied via Docker Compose `environment:`/`env_file:`. Never hardcode secrets, never pass them via build `ARG`/`--build-arg`, and never expose them to the frontend bundle. `.env` is gitignored; `.env.example` documents the variable names only.

## S-2: Run lint before committing TypeScript/JavaScript

- **Domain**: other
- **File Type**: .ts, .tsx
- **Action Type**: * (all)
- **Source**: global `CLAUDE.md` (Code Change Workflow)

Lint (and unit tests) must pass before any commit. Applies to all TS/TSX across `apps/` and `packages/`.

## S-3: Validate API inputs and outputs at the boundary with shared Zod schemas

- **Domain**: api-design
- **File Type**: .ts
- **Action Type**: create
- **Source**: design decision (AD-1, AD-2)

Every Fastify route validates request bodies/params and serializes responses against Zod schemas defined in `packages/shared`. The frontend imports the same schemas/types so the contract has one source of truth.

## S-4: Use parameterized queries / ORM bindings; never concatenate SQL

- **Domain**: security
- **File Type**: .ts, .sql
- **Action Type**: * (all)
- **Source**: design constraint (AD-4)

All database access goes through Drizzle's query builder or parameterized statements. No string interpolation of user input into SQL.

## S-5: Nutrition-engine code is pure, dependency-free, and unit-tested first (TDD)

- **Domain**: testing
- **File Type**: .ts
- **Action Type**: create
- **Source**: design decision (AD-1, AD-3) + NFR-3 + user election (full TDD)

`packages/nutrition-engine` must contain no I/O, `Date`, randomness, or framework imports. Write failing unit tests (Vitest) with hand-verified expected totals — mixed units, multi-serving, missing-data — before implementing each calculation. Assert against a defined rounding tolerance (e.g. ±1 kcal, ±0.5 g), not exact equality.

## S-6: No emojis

- **Domain**: other
- **File Type**: * (all)
- **Action Type**: * (all)
- **Source**: global `CLAUDE.md` (Behavior & Communication)

No emojis in code, comments, commit messages, documentation, or user-facing UI copy.
