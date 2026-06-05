# Bundle 1: Recipe Skeleton

> Slice 1: Walking Skeleton (Stage: skeleton)
> Stage: skeleton | Parallel: no | Files: packages/nutrition-engine/*, packages/shared/src/*, apps/api/drizzle/0002_recipe_library.sql, apps/api/src/db/schema.ts, apps/api/src/routes/recipes.ts, apps/api/src/server.ts, apps/web/src/views/MealLibrary.tsx, apps/web/src/query/recipes.ts

**Bundle Verify**: A recipe can be created and listed end-to-end on the platform foundation.
- **Level**: integration
- **Given**: platform-foundation running (api + seeded postgres) with migration 0002 applied
- **Action**: POST a minimal recipe, then GET /recipes, then load the Meal Library view
- **Outcome**: the recipe persists, appears in the list response, and renders in the library view

> **Context**
>
> **Applicable ACs**
> - **AC-1.1**: Given: I am in the Meal Library / When: I add a new recipe with a name, meal type, servings, and at least one ingredient / Then: the recipe is saved and appears in the library
>
> **Architecture Decisions**
> - **AD-1: Pure, shared, TDD nutrition-engine package** — Decision: `packages/nutrition-engine` is a pure module used by web + api. Rationale: one place to satisfy NFR-3; built first as this spec's walking-skeleton seed.
> - **AD-2: Recipe/ingredient/tag schema as a feature migration on the platform baseline** — Decision: migration 0002 adds ingredients, recipes, recipe_ingredients, tags, recipe_tags, usda_food_cache; every owned table carries workspace_id NOT NULL. Rationale: hybrid columns+JSONB; build on baseline 0001, do not redefine workspaces/units.
> - **AD-5: Library UI server state via TanStack Query** — Decision: TanStack Query for recipe queries/mutations; live nutrition via the shared engine. Rationale: automatic caching/loading/error; responsive React satisfies NFR-2.
>
> **Findings**
> - **F-1: Prototype is React; components/math port directly** — the prototype's MealLibrary/recipe UI ports into a responsive React view.
> - **F-10: Hybrid schema (macro columns + micronutrient JSONB)** — recipe/ingredient tables use macro columns + JSONB micros.
>
> **Standards**
> - **S-3**: Validate API inputs/outputs with shared Zod schemas (Domain: api-design | File Type: .ts)
> - **S-4**: Use Drizzle/parameterized queries; never concatenate SQL (Domain: security | File Type: .ts/.sql)
> - **S-5**: Schema changes via versioned drizzle-kit migrations on the platform baseline (Domain: other | File Type: .sql/.ts)
> - **S-7**: No emojis (Domain: other | File Type: *)
>
> **Constraints**
> - Builds on platform-foundation; must not redefine workspaces/units/baseline (Category: infrastructure | Source: technical)
>
> **Contracts**
> - POST /recipes — create a recipe; 400 (error envelope) on validation failure
> - GET /recipes — list recipes (later gains q/mealType/tag filters)

#### STEP-1: Nutrition-engine package scaffold
MANUAL -> Scaffold the shared packages/nutrition-engine workspace package

> **Intent**: N/A — structural step

- Create `packages/nutrition-engine/package.json` (name, main/exports, Vitest dev dep) registered in the root workspace
- Add `tsconfig.json` extending `tsconfig.base.json`; create an empty `src/index.ts` barrel
- No runtime dependencies — the engine must stay pure (AD-1, S-1)

**Verify**:
- Level: inspection | Given: the repo root | Action: `npm ls -w packages/nutrition-engine` | Outcome: the package resolves in the workspace with zero runtime dependencies

> Depends on: — | Enables: STEP-9, STEP-37 | Parallel with: —

#### STEP-2: Test-first — shared recipe/ingredient schema
MANUAL -> Test-first for STEP-3

> **Intent**: The shared Zod schemas are the contract for both api and web (S-3). A recipe schema that accepts `servings: 0` or an ingredient with neither an `ingredientId` nor custom nutrition would let invalid recipes through to the calc engine. Tests must pin servings>=1 and the meal-type enum.

- Write Vitest tests for the recipe/ingredient Zod schemas: valid recipe parses; servings<1 rejected; invalid meal_type rejected; ingredient requires quantity+unit
- Tests fail before STEP-3

**Verify**:
- Level: unit | Given: the schema test file | Action: run Vitest before STEP-3 | Outcome: tests fail (schemas not implemented)

> Depends on: — | Enables: STEP-3 | Parallel with: —

#### STEP-3: Shared recipe/ingredient types and Zod schemas
[FR-1 -> AC-1.1] | modify `packages/shared/src/types.ts`, `packages/shared/src/schemas.ts` | Effort: S

> **Intent**: These types are imported by the engine, the API routes, and the UI — they must match the migration 0002 columns (macro fields, `micronutrients` map, `mealType` enum of breakfast/lunch/dinner/snack, `servings>=1`). A drift between schema and DB surfaces as runtime validation failures or silent data loss.
> **Standards**: S-3 (Zod), S-7

- Define `Recipe`, `RecipeIngredient`, `Ingredient`, `Nutrition` (macros + micronutrients absolute-mass map) types
- Define matching Zod schemas: servings>=1, meal_type enum, ingredient quantity+unit required
- Export types + schemas from `packages/shared`

**Verify**:
- Level: unit | Given: the schemas from STEP-2 | Action: run Vitest | Outcome: valid recipe parses; servings<1 and bad meal_type rejected — tests pass

> Depends on: STEP-2 | Enables: STEP-4, STEP-6 | Parallel with: —

#### STEP-4: Feature migration 0002 and Drizzle models
[FR-1 -> AC-1.1] | create `apps/api/drizzle/0002_recipe_library.sql`; modify `apps/api/src/db/schema.ts` | Effort: M

> **Intent**: This migration extends baseline 0001 (AD-2) and must NOT redefine `workspaces`/`units`. Every owned table needs `workspace_id NOT NULL` referencing the seeded workspace (platform AD-4). `ingredients` stores macros as columns + `micronutrients JSONB` (absolute mass), `source` (usda|custom), nullable `fdc_id`, `reference_grams` default 100, and `gram_weight_per_qty`; `recipe_ingredients.unit_code` FKs to the seeded `units`. The XOR/quantity rules from the design must be enforced as CHECK constraints so bad rows can't persist.
> **Standards**: S-5 (versioned migration on baseline), S-4

- Create migration 0002: ingredients, recipes, recipe_ingredients (unit_code FK→units), tags, recipe_tags, usda_food_cache (keyed by fdc_id)
- All owned tables: workspace_id NOT NULL FK; recipes.servings CHECK >=1; recipes.meal_type CHECK in the four slots
- Add Drizzle models for the new tables in db/schema.ts (reuse baseline workspaces/units; do not redefine)
- Index workspace_id, recipes(workspace_id,meal_type), recipe_ingredients(recipe_id), recipe_tags(tag_id)

**Verify**:
- Level: integration | Given: a DB with baseline 0001 applied | Action: apply 0002 then insert a recipe with servings=0 | Outcome: tables exist; the servings=0 insert is rejected by the CHECK constraint; a valid recipe inserts
- Level: integration | Given: the migrated schema | Action: insert a recipe_ingredient with an invalid unit_code (not in units) or a recipe with an out-of-enum meal_type | Outcome: the FK / meal_type CHECK constraint rejects the row (bad data cannot persist)

> Depends on: STEP-3 | Enables: STEP-6, STEP-25, STEP-29 | Parallel with: —

#### STEP-5: Test-first — thin recipe create/list
MANUAL -> Test-first for STEP-6

> **Intent**: This proves the end-to-end persistence path for recipes (web→api→postgres) before depth work. The test must assert a created recipe is workspace-scoped (resolved server-side, platform AD-4) and reappears in the list from the DB — a hardcoded list response would pass a naive test, so assert round-trip from persistence.

- Write a Supertest test: POST /recipes with a minimal valid body returns 201 and the created recipe; GET /recipes includes it (read from DB, scoped to the seeded workspace)
- Tests fail before STEP-6

**Verify**:
- Level: integration | Given: the recipes test | Action: run Supertest before STEP-6 | Outcome: fails (routes not implemented)

> Depends on: STEP-4 | Enables: STEP-6 | Parallel with: —

#### STEP-6: Thin recipe create and list routes
[FR-1 -> AC-1.1] | create `apps/api/src/routes/recipes.ts`; modify `apps/api/src/server.ts` | Effort: M

> **Intent**: The thin create/list path is the skeleton — full CRUD/filter/search come in Bundle 4. Writes must be scoped to the workspace via `resolveWorkspaceId()` (platform), validated by the shared Zod schema (S-3), and persisted via Drizzle (S-4). Returning the created row from the DB (not echoing the request) confirms persistence and surfaces server-applied defaults.
> **Standards**: S-3, S-4, S-7

- Implement POST /recipes: validate body (Zod), insert workspace-scoped via Drizzle, return the persisted recipe
- Implement GET /recipes: return the workspace's recipes from the DB
- Register the routes on the Fastify server under /api/v1
- Reuse the platform error envelope for validation failures

**Verify**:
- Level: integration | Given: seeded DB | Action: POST a valid recipe then GET /recipes | Outcome: 201 with the persisted recipe; GET includes it (from DB), scoped to the seeded workspace — STEP-5 tests pass

> Depends on: STEP-4, STEP-3 | Enables: STEP-7, STEP-29 | Parallel with: —

#### STEP-7: Meal Library view shell wired to the list
[FR-1 -> AC-1.1] | create `apps/web/src/views/MealLibrary.tsx`, `apps/web/src/query/recipes.ts` | Effort: S

> **Intent**: This fills the platform's placeholder Library tab and proves the web→api read path. The recipes query must go through TanStack Query keyed for later filter/search reuse (AD-5); a one-off fetch here would force a rewrite in Bundle 5. No nutrition display yet (that arrives with the engine + editor).
> **Standards**: S-7

- Create a `useRecipes` TanStack Query hook in `query/recipes.ts` calling GET /recipes via the platform API client
- Render the recipe list in `MealLibrary.tsx`; mount it in the Library tab placeholder
- Show loading and empty states (no recipes yet)

**Verify**:
- Level: integration | Given: api returning one recipe | Action: render MealLibrary | Outcome: the recipe appears in the list; an empty list shows the empty state (not a blank screen)
- Level: unit | Given: the useRecipes hook | Action: inspect its TanStack Query usage | Outcome: it uses a structured query key (e.g. ['recipes', filters]) so Bundle 5 can extend it for filter/search reuse rather than a one-off fetch

> Depends on: STEP-6 | Enables: STEP-37, STEP-41 | Parallel with: —
