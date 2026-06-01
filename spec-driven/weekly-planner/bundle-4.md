# Bundle 4: Planned-Meal Detail View

> Slice 2: Feature Depth (Stage: depth)
> Stage: depth | Parallel: yes (file-disjoint new component; depends on Bundle 1 view + the recipe-library recipe read) | Files: apps/web/src/components/PlannedMealDetail.tsx, apps/web/src/views/WeeklyPlanner.tsx

**Bundle Verify**: Clicking a planned meal opens a detail showing notes and the link, and for a recipe-backed meal its nutrition is available from the detail.
- **Level**: integration
- **Given**: the week view with a freeform meal and a recipe-backed meal
- **Action**: click each planned meal
- **Outcome**: the detail shows notes + link (if present); for the recipe meal, its nutrition breakdown is available (read via recipe-library `GET /recipes/:id`)

> **Context**
>
> **Applicable ACs**
> - **AC-2.1**: Given: a day with a planned meal / When: I click the meal / Then: a detail view opens showing notes and the link (if present)
> - **AC-2.2**: Given: a planned meal that is a saved recipe / When: I open its detail / Then: its nutrition breakdown is available from the detail view
>
> **Architecture Decisions**
> - **AD-4: Planner server state via TanStack Query keyed by week** — Decision: the detail view reads a recipe-backed meal's notes/link/nutrition via the recipe-library `GET /recipes/:id` path (shared engine computes nutrition). Rationale: no duplicated nutrition logic on the client; one source of recipe truth.
> - **AD-3: Recipe-or-freeform meals; tombstone on recipe delete** — Decision: a freeform meal's detail uses its own fields; a tombstoned recipe entry (recipe_id NULL) renders a "recipe removed" state. Rationale: the planned slot survives recipe deletion.
>
> **Findings**
> - **F-1: Prototype is React; planner components port directly** — the prototype's planned-meal detail view ports into a React component.
> - **F-4: TanStack Query handles the async matrix** — the recipe read for the detail reuses recipe-library's cached recipe query.
>
> **Standards**
> - **S-5**: Round nutrition only at display; aggregate macros (not %DV) on unrounded values (Domain: other | File Type: .tsx)
> - **S-7**: No emojis (Domain: other | File Type: *)
>
> **Contracts**
> - GET /recipes/:id (recipe-library) — notes, sourceLink, computed nutrition for a recipe-backed planned meal
> - Plan entry shape carries freeformTitle/Description/Link (freeform) or recipeId/recipeName (recipe)

#### STEP-15: Test-first — planned-meal detail
MANUAL -> Test-first for STEP-16

> **Intent**: The detail view covers two meal kinds and a tombstone. Tests must assert: a freeform meal's detail shows its title/description/link (link only when present); a recipe-backed meal's detail shows recipe notes/link and surfaces the recipe's nutrition (read from recipe-library, computed via the shared engine), with nutrition rounded only at display (S-5) and incomplete data flagged, not zeroed; a tombstoned entry (recipe_id NULL) shows a "recipe removed" state rather than crashing or showing blank nutrition.

- Write component tests (Vitest + testing-library): freeform detail shows notes + link; recipe detail shows recipe notes/link + nutrition (mocked recipe-library response); a missing link is omitted (not a broken anchor); a tombstoned entry shows "recipe removed"
- Tests fail before STEP-16

**Verify**:
- Level: unit | Given: the detail test | Action: run before STEP-16 | Outcome: fail (component not implemented)

> Depends on: STEP-6 | Enables: STEP-16 | Parallel with: STEP-21

#### STEP-16: PlannedMealDetail (notes/link + recipe nutrition)
[FR-2 -> AC-2.1, AC-2.2] | create `apps/web/src/components/PlannedMealDetail.tsx`; modify `apps/web/src/views/WeeklyPlanner.tsx` | Effort: M

> **Intent**: Clicking a planned meal opens a detail. For a freeform meal it shows the entry's own notes/link (AC-2.1). For a recipe-backed meal it reads the recipe via recipe-library's `GET /recipes/:id` (TanStack Query) and shows its notes/link plus its nutrition breakdown computed by the shared engine (AC-2.2) — rounding only at display and surfacing the completeness flag (S-5), never re-implementing nutrition in the planner. A tombstoned entry (recipe deleted) renders a clear "recipe removed" state (AD-3).
> **Standards**: S-5, S-7

- Build PlannedMealDetail: branch on freeform vs recipe-backed vs tombstone
- Freeform: show title/description and the link only when present (AC-2.1)
- Recipe-backed: read the recipe via recipe-library `GET /recipes/:id`; show notes/link and the nutrition breakdown (formatted at display, completeness flagged) (AC-2.2)
- Wire a click on a planned meal in WeeklyPlanner to open the detail

**Verify**:
- Level: integration | Given: a freeform meal with a link and a recipe-backed meal | Action: click each | Outcome: the freeform detail shows notes + link; the recipe detail shows notes/link and its nutrition breakdown (via the shared engine, rounded at display) (AC-2.1/AC-2.2) — STEP-15 tests pass
- Level: unit | Given: a tombstoned entry (recipe_id NULL) | Action: open its detail | Outcome: a "recipe removed" state is shown (no crash/blank nutrition)

> Depends on: STEP-15, STEP-6 | Enables: — | Parallel with: STEP-22
