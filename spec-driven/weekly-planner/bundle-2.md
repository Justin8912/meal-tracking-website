# Bundle 2: Plan Entry CRUD (recipe + freeform, XOR)

> Slice 2: Feature Depth (Stage: depth)
> Stage: depth | Parallel: no (extends routes/plans.ts, WeeklyPlanner.tsx, query/plans.ts from Bundle 1) | Files: apps/api/src/routes/plans.ts, apps/web/src/views/WeeklyPlanner.tsx, apps/web/src/query/plans.ts

**Bundle Verify**: A day's meal can be added (recipe or freeform), edited, and removed; the recipe/freeform XOR holds; an empty day shows an add state; a save failure surfaces an error and does not silently lose the plan.
- **Level**: integration
- **Given**: api + seeded postgres (migration 0003) and the skeleton view
- **Action**: add a freeform meal, edit it, remove it; add a recipe meal; attempt a both-recipe-and-freeform body; force a save failure
- **Outcome**: CRUD persists; the XOR body is rejected (400 envelope); the empty day shows an add affordance; the forced save failure shows an error (plan not lost)

> **Context**
>
> **Applicable ACs**
> - **AC-1.2**: Given: a planned week / When: I add a meal by selecting a recipe / Then: the recipe is placed on that day
> - **AC-1.3**: Given: a planned week / When: I add a meal by entering a title/description/optional link / Then: the freeform meal is placed on that day
> - **AC-1.4**: Given: a day with a planned meal / When: I edit or delete that meal / Then: the change persists for that day
> - **AC-1.5**: Given: a day with no planned meal / When: I view the week / Then: the day shows a clear empty/add state
> - **AC-1.6**: Given: a day's meal being added/edited/removed / When: the server-side save fails / Then: an error indicates the change was not saved, and the plan is not silently lost
>
> **Architecture Decisions**
> - **AD-3: Recipe-or-freeform meals; tombstone on recipe delete** — Decision: nullable recipe_id FK ON DELETE SET NULL + XOR CHECK; POST accepts `{recipeId}` XOR `{freeformTitle,...}`. Rationale: two mutually exclusive meal kinds; a deleted recipe leaves a tombstone.
> - **AD-4: Planner server state via TanStack Query keyed by week** — Decision: useMutation for add/edit/remove invalidates / optimistically updates the active week's query. Rationale: consistent loading/error; surfaces save failure (AC-1.6).
>
> **Findings**
> - **F-12: plan_entries XOR recipe/freeform** — one table; a row is a recipe ref OR a freeform meal.
> - **F-4: TanStack Query handles the async matrix** — mutations surface loading/error for add/edit/remove.
>
> **Standards**
> - **S-1**: Validate API inputs/outputs with shared Zod schemas, incl. the XOR rule (Domain: api-design | File Type: .ts)
> - **S-2**: Use Drizzle/parameterized queries; never concatenate SQL (Domain: security | File Type: .ts/.sql)
> - **S-7**: No emojis (Domain: other | File Type: *)
>
> **Contracts**
> - POST /plans (`{recipeId}` XOR `{freeformTitle,...}`), PUT /plans/:id, DELETE /plans/:id
> - Errors use the platform envelope `{ error: { code, message } }` (AC-1.6)

#### STEP-7: Test-first — freeform CRUD + save-failure
MANUAL -> Test-first for STEP-8

> **Intent**: Editing and deleting must persist for the right day/slot, and a save failure must be surfaced rather than swallowed (AC-1.6) — a planner that silently drops an edit is worse than one that errors. Tests must exercise add->edit->remove of a freeform meal and assert that a forced server failure on a mutation reports an error and leaves the user's in-progress plan visible (not lost/blanked).

- Write Supertest tests for PUT /plans/:id and DELETE /plans/:id (freeform): edit changes persist; delete removes the entry; a both-recipe-and-freeform PUT body is rejected (400 envelope)
- Write a web mutation test (or integration): a forced save failure on add/edit shows an error and does not clear the day's in-progress entry
- Tests fail before STEP-8

**Verify**:
- Level: integration | Given: the CRUD + save-failure tests | Action: run before STEP-8 | Outcome: fail (CRUD/error handling not implemented)

> Depends on: STEP-5, STEP-6 | Enables: STEP-8 | Parallel with: —

#### STEP-8: Freeform add/edit/remove + save-failure surfacing
[FR-1 -> AC-1.3, AC-1.4, AC-1.6] | modify `apps/api/src/routes/plans.ts`, `apps/web/src/views/WeeklyPlanner.tsx`, `apps/web/src/query/plans.ts` | Effort: M

> **Intent**: Complete the plan-entry write surface: PUT /plans/:id and DELETE /plans/:id (workspace-scoped, Zod-validated incl. the XOR on edit, S-1/S-2), and wire add/edit/remove through TanStack Query mutations that invalidate (or optimistically update) the week-keyed query (AD-4). The defining risk is AC-1.6 — a DB failure must surface as the platform error envelope and the UI must show a clear "not saved" error without discarding the user's entry (no silent loss).
> **Standards**: S-1, S-2, S-7

- Implement PUT /plans/:id and DELETE /plans/:id (workspace-scoped Drizzle, Zod incl. XOR on edit); a DB failure raises a PersistenceError (5xx envelope), never a false success
- Add a freeform add/edit form to the day cell; wire add/edit/remove via TanStack Query mutations keyed to the active week
- On mutation error, show a clear "change not saved" message and keep the in-progress entry visible (AC-1.6)

**Verify**:
- Level: integration | Given: a freeform meal on a day | Action: edit its title then delete it | Outcome: the edit persists; the delete removes it (AC-1.3/AC-1.4); a both-set PUT is rejected (400)
- Level: integration | Given: the day form with the server forced to fail | Action: save a freeform meal | Outcome: a clear error is shown and the entry is not lost/blanked (AC-1.6)

> Depends on: STEP-7, STEP-3 | Enables: STEP-10 | Parallel with: —

#### STEP-9: Test-first — recipe add + empty-day state
MANUAL -> Test-first for STEP-10

> **Intent**: Adding a recipe to a day (AC-1.2) and the empty-day affordance (AC-1.5) are distinct from freeform. Tests must assert a recipe-only add places the recipe on the right day (and the entry carries recipeId, not freeform fields), and that a day with no meal renders a clear add/empty state rather than an indistinguishable blank cell.

- Write a component/integration test: adding a recipe to a day creates a recipe-only entry on that day; a day with no entries renders an explicit empty/add state
- Tests fail before STEP-10

**Verify**:
- Level: unit | Given: the recipe-add + empty-state test | Action: run before STEP-10 | Outcome: fail (not implemented)

> Depends on: STEP-8 | Enables: STEP-10 | Parallel with: —

#### STEP-10: Recipe add to a day + empty-day state
[FR-1 -> AC-1.2, AC-1.5] | modify `apps/web/src/views/WeeklyPlanner.tsx` | Effort: S

> **Intent**: Outside edit mode, a day cell offers adding a saved recipe (recipe-only entry via POST /plans `{recipeId}`, AC-1.2) and renders a clear empty/add state when no meal is planned (AC-1.5) so an empty day is distinguishable from a loading or broken cell. Drag-to-assign is Bundle 5; this is the non-DnD add path.
> **Standards**: S-7

- Add a "select a recipe" add path to the day cell that POSTs a recipe-only entry (reusing recipe-library `GET /recipes` for the choices)
- Render an explicit empty/add state on days with no entries (distinct from loading)
- Place the added recipe on the chosen day via the week-keyed mutation

**Verify**:
- Level: integration | Given: a week with one empty day | Action: add a recipe to it | Outcome: the recipe is placed on that day as a recipe-only entry (AC-1.2); other empty days still show the empty/add state (AC-1.5) — STEP-9 tests pass

> Depends on: STEP-9, STEP-8 | Enables: — | Parallel with: —
