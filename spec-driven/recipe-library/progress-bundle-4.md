# Progress: Bundle 4 — Recipe CRUD, Tags & Search (API)

> Tasks: spec-driven/recipe-library/bundle-4.md | Bundle: 4 | Branch: impl/recipe-library/bundle-4 | Last Updated: 2026-05-30

Progress: 8/8 steps complete

## Current State

- Stage: depth
- Last completed: STEP-35 — case-insensitive recipe name search on GET /recipes
- Next up: Bundle 5 (recipe-library UI depth)
- Blockers: none

The recipe API now supports full CRUD, tagging, server-side tag/meal-type
filtering, and name search, with validation and save-failure surfaced as the
shared error envelope. Building on the thin Bundle-1 create/list path:

- GET /recipes/:id returns a recipe with its hydrated ingredient lines
  (ingredientId, name, quantity, unitCode) and tag labels. Computed nutrition
  is deferred to the UI/engine in a later slice (contracts.md allows this).
- PUT /recipes/:id updates fields and fully replaces ingredients and tags in a
  transaction; DELETE /recipes/:id is workspace-scoped (join rows cascade,
  weekly-plan references left as tombstones via the platform ON DELETE SET NULL).
- Create/update persist recipe_ingredients and recipe_tags (Bundle 1 had
  deferred the join writes); both run in a transaction so a partial write
  cannot half-replace the prior state.
- Validation rejects no-name/no-ingredients with a 400 envelope and persists
  nothing (AC-1.5); any write failure throws a PersistenceError so the global
  handler emits a 5xx envelope, never a false success (AC-1.6); notes/link
  remain optional (AC-1.4).
- GET/POST /tags: workspace-scoped, UNIQUE(workspace_id,label), idempotent
  upsert by label; applying tags via the recipe payload upserts + links them
  (AC-5.1 feeds AC-5.2).
- GET /recipes?tag=&mealType=&q= are parameterized Drizzle conditions combined
  with AND; blank params ignored; q is a Postgres ILIKE name match returning an
  empty array (200) for no matches (AC-5.2/5.3/6.1, feeds AC-6.2). SQL/LIKE
  metacharacters in a tag/q value are treated literally (S-4, no injection).

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-28 | done | `8404817` | Test-first full recipe CRUD + failure paths (PUT/DELETE/GET:id, empty-optional save, no-name/no-ingredients 400, forced DB-failure 5xx); red before STEP-29 |
| STEP-29 | done | `570e09a` | GET/:id (ingredients+tags), PUT (transactional full-replace), DELETE (workspace-scoped); create/update persist recipe_ingredients+recipe_tags; 400 validation + 5xx PersistenceError; shared Tag/RecipeDetail types+schemas |
| STEP-30 | done | `2261707` | Test-first tags: create, idempotent upsert (no dup label), empty-label 400, recipe-payload tags write recipe_tags + queryable via ?tag= |
| STEP-31 | done | `570e09a` | GET/POST /tags + upsertTagsByLabel helper + recipe association + route registration in server.ts (shipped in the STEP-29 commit because the recipe write path depends on the tag upsert helper; tests added in `2261707`) |
| STEP-32 | done | `8201d0d` | Test-first filtering: ?tag= (AC-5.2), ?mealType= (AC-5.3), AND combine, empty params ignored, SQL-metachar tag treated literally |
| STEP-33 | done | `8201d0d` | ?tag= (recipe_tags/tags join subquery by workspace+label) + ?mealType= as parameterized Drizzle AND conditions; blank-to-undefined coercion; typed `tags` table join (S-4) |
| STEP-34 | done | `061e19d` | Test-first search: ?q= case-insensitive partial (AC-6.1), composes with filters (AND), whitespace ignored, no-match -> [] (200, AC-6.2) |
| STEP-35 | done | `061e19d` | ?q= parameterized Postgres ILIKE on recipes.name, trimmed/skipped when blank, AND-composed with filters (impl shipped in the GET /recipes rebuild; tests added in `061e19d`) |

Note: STEP-31 and STEP-35 implementations landed inside earlier commits because
the recipe write/read path was rebuilt as a unit (the tag upsert helper is a
dependency of recipe create/update, and `?q=` is part of the same GET /recipes
query builder as the filters). Each step's verifying tests are committed under
its own step number, all green.

## Verification

- Per-workspace typecheck (`npm run typecheck`): all four workspaces clean.
- Tests (disposable Dockerized postgres:16-alpine on a test port, migrations
  0001+0002, DATABASE_URL set): nutrition-engine 27, shared 22, api 70 (incl.
  the new recipes-crud / tags / recipes-filter / recipes-search integration
  suites), web 9 = 128 pass. Integration tests skip gracefully without
  DATABASE_URL; `fileParallelism:false` retained.
- Bundle Verify (api + seeded postgres + tagged recipes): PUT update persists
  and reflects in GET/:id; DELETE removes from GET and search; POST/GET /tags
  create + idempotent upsert; ?tag=&mealType= filter with AND; ?q= name search
  including the empty-result ([], 200) case; invalid save -> 400 envelope
  (nothing persisted); forced DB failure -> 5xx envelope (no false success).
- Note: the repo-root `npm run lint` (a flat base-tsconfig compile) reports
  pre-existing JSX errors in apps/web only; no errors in apps/api or
  packages/shared. The authoritative per-workspace typecheck is green.

## Session Log

### 2026-05-30 — bundle complete
- Completed: STEP-28..35 (8/8) via TDD; recipe CRUD, tags, filtering, search.
- Decisions:
  - GET /recipes/:id returns ingredients + tags now; computed nutrition is
    deferred to the UI/engine slice (contracts.md permits this).
  - Tag/q filters use the typed Drizzle `tags` table join and bound parameters
    (no raw SQL string-concat); metacharacters stay literal (S-4).
  - Create/update run in a transaction and fully replace association rows so a
    partial write cannot corrupt prior state.
- Next: Bundle 5 (recipe-library UI depth).
