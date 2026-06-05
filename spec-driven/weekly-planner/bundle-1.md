# Bundle 1: Plan Skeleton

> Slice 1: Walking Skeleton (Stage: skeleton)
> Stage: skeleton | Parallel: no | Files: packages/shared/src/types.ts, packages/shared/src/schemas.ts, apps/api/drizzle/0003_weekly_planner.sql, apps/api/src/db/schema.ts, apps/api/src/routes/plans.ts, apps/api/src/server.ts, apps/web/src/views/WeeklyPlanner.tsx, apps/web/src/query/plans.ts

**Bundle Verify**: A planned meal can be added to a day and the week listed end-to-end on the platform + recipe-library foundation.
- **Level**: integration
- **Given**: platform-foundation + recipe-library running (api + seeded postgres) with migration 0003 applied
- **Action**: POST a plan entry for a week/day/slot, then GET /plans?weekStart=, then load the Weekly Planner view
- **Outcome**: the entry persists, appears in the week response keyed by `week_start_date`, and the Mon-Sun week renders in the view

> **Context**
>
> **Applicable ACs**
> - **AC-1.1**: Given: I open the Weekly Planner / When: the week loads / Then: days Monday through Sunday are displayed
> - **AC-1.2**: Given: a planned week / When: I add a meal to a day by selecting a recipe / Then: the recipe is placed on that day
> - **AC-1.3**: Given: a planned week / When: I add a meal by entering a title/description/optional link instead of a recipe / Then: the freeform meal is placed on that day
> - **AC-3.1**: Given: the current week / When: I navigate backward / Then: the previous week's saved plan is displayed (skeleton proves the weekStart query path)
> - **AC-3.3**: Given: a previous week that had meals planned / When: I navigate back to it later / Then: the previously planned meals are still present (skeleton proves persistence/history)
>
> **Architecture Decisions**
> - **AD-1: plan_entries as a feature migration (0003) on the platform baseline** — Decision: one `plan_entries` table (week_start_date, day_of_week 0..6, meal_slot enum, position, recipe_id ON DELETE SET NULL, freeform_*, XOR CHECK); workspace_id NOT NULL. Rationale: a thin association of (week,day,slot,position) to a recipe-or-freeform meal; builds on baseline 0001, does not redefine recipe-library tables.
> - **AD-2: Identify a week by week_start_date (the Monday's DATE)** — Decision: store/compute the Monday DATE server-side; range-query / shift by 7 days. Rationale: avoids the prototype's ISO/year-boundary bug.
> - **AD-3: Recipe-or-freeform meals; tombstone on recipe delete** — Decision: nullable recipe_id FK ON DELETE SET NULL + XOR CHECK. Rationale: a deleted recipe must not erase/orphan the planned slot.
> - **AD-4: Planner server state via TanStack Query keyed by week** — Decision: useQuery keyed by week_start_date. Rationale: instant navigation from cache (NFR-1).
>
> **Findings**
> - **F-11: Prototype week-key has ISO/year-boundary bug** — identify a week by the Monday's DATE server-side, not a YYYY-Www string.
> - **F-12: plan_entries is the only new table; XOR recipe/freeform** — one table; a row is a recipe ref OR a freeform meal.
>
> **Standards**
> - **S-1**: Validate API inputs/outputs with shared Zod schemas, incl. the XOR rule (Domain: api-design | File Type: .ts)
> - **S-2**: Use Drizzle/parameterized queries; never concatenate SQL (Domain: security | File Type: .ts/.sql)
> - **S-3**: Schema changes via versioned drizzle-kit migrations on the platform baseline (Domain: other | File Type: .sql/.ts)
> - **S-4**: Identify a week by the Monday DATE computed server-side; never an ISO week string (Domain: other | File Type: .ts)
> - **S-7**: No emojis (Domain: other | File Type: *)
>
> **Constraints**
> - Builds on platform-foundation AND recipe-library; must not redefine their tables (Category: infrastructure | Source: technical)
>
> **Contracts**
> - POST /plans — add a planned meal: `{ recipeId }` XOR `{ freeformTitle, freeformDescription?, freeformLink? }`; 400 envelope on validation failure
> - GET /plans?weekStart=YYYY-MM-DD — the week's entries keyed by Monday DATE

#### STEP-1: Test-first — shared plan schema (recipe/freeform XOR)
MANUAL -> Test-first for STEP-2

> **Intent**: The shared Zod schema is the contract for both api and web (S-1) and is the first line of defence for the recipe/freeform XOR (AD-3). A plan body that carries both a `recipeId` and a `freeformTitle`, or neither, must be rejected before it reaches the route. Tests must also pin `dayOfWeek` to 0..6 and the `mealSlot` enum so an out-of-range day or bad slot cannot pass.

- Write Vitest tests for the plan-entry Zod schema: a recipe-only body parses; a freeform-only body parses; a both-recipe-and-freeform body is rejected; a neither body is rejected; dayOfWeek 7 and an invalid mealSlot are rejected
- Tests fail before STEP-2

**Verify**:
- Level: unit | Given: the plan schema test file | Action: run Vitest before STEP-2 | Outcome: tests fail (schema not implemented)

> Depends on: — | Enables: STEP-2 | Parallel with: —

#### STEP-2: Shared plan types and Zod schemas (XOR refinement)
[FR-1 -> AC-1.2, AC-1.3] | modify `packages/shared/src/types.ts`, `packages/shared/src/schemas.ts` | Effort: S

> **Intent**: These types are imported by the plan routes and the planner UI and must match the migration 0003 columns (week_start_date, day_of_week 0..6, meal_slot enum, position, recipe_id, freeform_*). The XOR between a recipe reference and a freeform meal (AD-3) is expressed as a Zod `.refine()` so the contract — not just the DB — enforces it. Drift here surfaces as runtime validation failures or silently-dropped fields.
> **Standards**: S-1 (Zod), S-7

- Define `PlanEntry`, `PlanEntryInput`, and `WeeklySummary` types (PlanEntry carries weekStartDate, dayOfWeek, mealSlot, position, recipeId|null, recipeName?, freeform fields)
- Define the `planEntryInputSchema` Zod schema: dayOfWeek int 0..6, mealSlot enum, and a `.refine()` enforcing exactly one of {recipeId} / {freeformTitle}
- Export the types + schemas from `packages/shared`

**Verify**:
- Level: unit | Given: the schemas from STEP-1 | Action: run Vitest | Outcome: recipe-only and freeform-only bodies parse; both/neither and out-of-range day/slot rejected — tests pass

> Depends on: STEP-1 | Enables: STEP-3, STEP-5 | Parallel with: —

#### STEP-3: Feature migration 0003 and the plan_entries Drizzle model
[FR-1 -> AC-1.2 | FR-3 -> AC-3.3] | create `apps/api/drizzle/0003_weekly_planner.sql`; modify `apps/api/src/db/schema.ts` | Effort: M

> **Intent**: This migration extends baseline 0001 (AD-1) and must NOT redefine `workspaces`/`units` or the recipe-library tables (`recipes`/`ingredients`/`tags`). `plan_entries` needs `workspace_id NOT NULL` FK (platform convention), `week_start_date DATE NOT NULL` (the Monday, AD-2), `day_of_week SMALLINT CHECK 0..6`, `meal_slot` constrained to the four slots, `position`, a nullable `recipe_id` FK to `recipes(id) ON DELETE SET NULL` (tombstone, AD-3), and `freeform_title/description/link`. The XOR rule must be a DB-level CHECK so a recipe-and-freeform (or neither) row cannot persist even if a future caller bypasses Zod. Index `(workspace_id, week_start_date)` so the week query and history range-query are fast (NFR-1).
> **Standards**: S-3 (versioned migration on baseline), S-2, S-4

- Create migration 0003: `plan_entries` with the columns above; `recipe_id` FK -> recipes(id) ON DELETE SET NULL; meal_slot CHECK in the four slots; day_of_week CHECK 0..6
- Add the XOR CHECK: exactly one of (recipe_id IS NOT NULL) / (freeform_title IS NOT NULL)
- Add the Drizzle model for plan_entries in db/schema.ts (reuse baseline workspaces/units + recipe-library recipes; do not redefine)
- Index `(workspace_id, week_start_date)`

**Verify**:
- Level: integration | Given: a DB with baseline 0001 + recipe-library 0002 applied | Action: apply 0003, then insert a plan entry with both a recipe_id and a freeform_title | Outcome: tables exist; the both-set insert is rejected by the XOR CHECK; a valid recipe-only and a valid freeform-only row insert
- Level: integration | Given: a plan entry referencing a recipe | Action: delete that recipe in recipe-library | Outcome: the plan entry survives with recipe_id NULL (ON DELETE SET NULL tombstone), not deleted

> Depends on: STEP-2 | Enables: STEP-5, STEP-8, STEP-12 | Parallel with: —

#### STEP-4: Test-first — thin week list + add entry
MANUAL -> Test-first for STEP-5

> **Intent**: This proves the end-to-end persistence path for plans (web->api->postgres) before depth work. The test must assert the added entry is workspace-scoped (resolved server-side, platform AD-4), that `weekStart` is normalized to the Monday DATE server-side (AD-2) so a mid-week date still maps to the right week, and that the entry reappears in the GET /plans?weekStart= response from the DB (a hardcoded response would pass a naive test).

- Write a Supertest test: POST /plans with a minimal valid recipe-only body returns 201 and the created entry; GET /plans?weekStart=<Monday> includes it; GET with a mid-week date normalizes to the same Monday and still returns it
- Tests fail before STEP-5

**Verify**:
- Level: integration | Given: the plans test | Action: run Supertest before STEP-5 | Outcome: fails (routes not implemented)

> Depends on: STEP-3 | Enables: STEP-5 | Parallel with: —

#### STEP-5: Thin add-entry and week-list routes
[FR-1 -> AC-1.2 | FR-3 -> AC-3.1] | create `apps/api/src/routes/plans.ts`; modify `apps/api/src/server.ts` | Effort: M

> **Intent**: The thin add/list path is the skeleton — full CRUD/navigation/summary come in later bundles. Writes are scoped to the workspace via `resolveWorkspaceId()` (platform), validated by the shared Zod schema incl. the XOR (S-1), and persisted via Drizzle (S-2). `weekStart` is normalized to the Monday server-side (AD-2, S-4) so the query is robust to any in-week date. Returning the persisted row (not the request echo) confirms persistence.
> **Standards**: S-1, S-2, S-4, S-7

- Implement POST /plans: validate body (Zod incl. XOR), normalize/derive week_start_date to the Monday, insert workspace-scoped via Drizzle, return the persisted entry
- Implement GET /plans?weekStart=: normalize weekStart to the Monday, return the workspace's entries for that week from the DB
- Register the routes on the Fastify server under /api/v1 (reuse the existing prefixed plugin)
- Reuse the platform error envelope for validation failures

**Verify**:
- Level: integration | Given: seeded DB | Action: POST a valid recipe-only entry then GET /plans?weekStart=<Monday> | Outcome: 201 with the persisted entry; GET includes it (from DB), workspace-scoped; a mid-week weekStart returns the same week — STEP-4 tests pass

> Depends on: STEP-3, STEP-2 | Enables: STEP-8, STEP-12 | Parallel with: —

#### STEP-6: Weekly Planner view shell listing a week
[FR-1 -> AC-1.1] | create `apps/web/src/views/WeeklyPlanner.tsx`, `apps/web/src/query/plans.ts` | Effort: S

> **Intent**: This fills the platform's placeholder `/planner` tab and proves the web->api read path. The week plan query must go through TanStack Query keyed by `week_start_date` (AD-4) so navigation (Bundle 3) reuses the cache rather than a one-off fetch; a non-keyed fetch here would force a rewrite. The grid must render all seven days Monday->Sunday (AC-1.1) even when empty.
> **Standards**: S-4, S-7

- Create a `useWeekPlan(weekStart)` TanStack Query hook in `query/plans.ts` calling GET /plans?weekStart= via the platform API client, keyed `['plan', weekStart]`
- Replace the WeeklyPlanner placeholder with a Mon-Sun week grid (current week's Monday computed client-side) listing each day's entries
- Show loading and empty-day states (no meals yet)

**Verify**:
- Level: integration | Given: api returning one entry for the current week | Action: render WeeklyPlanner | Outcome: days Monday through Sunday are displayed (AC-1.1); the entry appears on its day; empty days show an add/empty state (not a blank screen)
- Level: unit | Given: the useWeekPlan hook | Action: inspect its TanStack Query usage | Outcome: it uses a week-keyed key (e.g. `['plan', weekStart]`) so Bundle 3 navigation reuses the cache rather than refetching

> Depends on: STEP-5 | Enables: STEP-8, STEP-12, STEP-16, STEP-18, STEP-22 | Parallel with: —
