---
slug: weekly-planner
status: final
spec_source: spec-driven/weekly-planner/spec.md
spec_tier: 1
spec_hash: sha256:87f810c05fd6932272e0224f8f84ccb05a4576fbd6ec3829342f72c45a2530ac
adaptive_flow: rich-via-context
test_approach: tdd
test_capabilities:
  unit: null
  integration: null
  e2e: null
created_date: 2026-05-30
last_updated: 2026-05-30
---

# Architectural Design: weekly-planner

## Overview

- **Spec**: Weekly Planner — 5 FRs (FR-1..FR-4 Must Have, FR-5 Nice to Have), 2 NFRs
- **Architecture**: new (greenfield) — builds on `platform-foundation` (persistence/deployment) AND `recipe-library` (recipes, recipe list/filters, nutrition engine)
- **Test approach**: tdd `[from program-wide election + NFR-2]`
- **Test capabilities**: unit=null, integration=null, e2e=null. **Recommended:** unit=**Vitest** (plan CRUD validation, the XOR recipe/freeform rule, and the week-start-date computation are logic worth pinning first), integration=**Supertest** (plan CRUD and week-range history cross into Postgres), e2e=**Playwright** (the FR-4 drag-and-drop edit flow and FR-3 week navigation are full user journeys; Playwright also drives touch emulation to verify AC-4.4 / NFR-2).

> Derived by partitioning the holistic `spec-driven/meal-tracking-mvp/design.md` (via `--context`) to the planner scope, building on the finalized `platform-foundation` and `recipe-library`. **[Context]**

## Technical Approach

Builds on `platform-foundation` (monorepo, `packages/shared`, Postgres + Drizzle baseline `0001` with seeded `workspaces`/`units`, Fastify skeleton + shared error envelope + server-side workspace resolution, runtime-config React/Vite frontend with the `/planner` route shell) and on `recipe-library` (recipe tables in migration `0002`, `GET /recipes` with its `q`/`mealType`/`tag` filters, and the pure shared `packages/nutrition-engine`). This spec does **not** redefine any of those — it adds one feature migration (`0003`) with the `plan_entries` table, the `/plans` routes, and the Weekly Planner UI that fills the platform's `/planner` placeholder.

**Plan storage (AD-1, FR-1/FR-3).** A feature migration `0003_weekly_planner.sql` on the baseline adds a single `plan_entries` table keyed by `week_start_date` (the Monday `DATE`, AD-2), `day_of_week` (0..6, Monday=0), a `meal_slot` enum (`breakfast`/`lunch`/`dinner`/`snack` — all four), and `position`. Each row is **either** a `recipe_id` FK (`ON DELETE SET NULL` — tombstone, AD-3) **or** a freeform meal (`freeform_title`/`freeform_description`/`freeform_link`), enforced by a XOR `CHECK` so a row cannot be both or neither. `workspace_id UUID NOT NULL` FKs to the seeded workspace (platform convention). No new tables are added beyond `plan_entries`; recipes/ingredients/tags belong to `recipe-library`.

**Week identity & history (AD-2, FR-3).** A week is identified by its Monday `DATE`, computed server-side, not the prototype's `YYYY-Www` string (holistic F-11). `GET /plans?weekStart=YYYY-MM-DD` returns the week's entries; navigation forward/back simply shifts `weekStart` by seven days and re-queries, so history is a plain date range-query and there are no year-boundary/ISO-53-week bugs. Past weeks persist as ordinary rows, so history is retained for free (AC-3.3).

**Recipe / freeform meals (AD-3, FR-1).** Adding a meal to a day/slot is `POST /plans` with **either** `{ recipeId }` **or** `{ freeformTitle, freeformDescription?, freeformLink? }` (XOR). Deleting a referenced recipe in `recipe-library` leaves the plan entry as a **tombstone** (`recipe_id` set NULL by `ON DELETE SET NULL`); the UI renders it as "recipe removed" rather than vanishing the planned slot (spec Assumption). Edit/remove are `PUT`/`DELETE /plans/:id`. Save/load failures surface through the platform error envelope so the plan is never silently lost (AC-1.6, AC-3.4).

**Server state (AD-4, FR-1/FR-3, NFR-1).** The frontend manages plan state with **TanStack Query keyed by `week_start_date`** (holistic AD-10), so revisiting a week is instant from cache and navigation feels immediate (NFR-1). Writes (`useMutation`) invalidate / optimistically update the active week's query. The planned-meal detail view (FR-2) pulls the recipe's notes, link, and nutrition by reading the recipe via `recipe-library`'s `GET /recipes/:id` (which computes nutrition through the shared `nutrition-engine`); freeform meals show their own title/description/link.

**Drag-and-drop edit mode (AD-5, FR-4, NFR-2).** Edit mode toggles a two-panel responsive layout: a filterable recipe palette (left) driven by `recipe-library`'s `GET /recipes` with its `mealType`/`tag` filters, and the week grid (right). Drag-and-drop is built on **dnd-kit** — a `PointerSensor` with a **touch activation delay** (so a touch-drag is distinguished from a scroll) plus a mouse distance threshold and a **keyboard sensor** for a11y — with a **tap-to-assign fallback** on mobile (holistic AD-9, holistic F-2/F-3): tap a recipe, then tap a target day/slot. The two-column layout (>=768px) collapses to a single column with the palette as a drawer on phones (NFR-2). Dropping (or tap-assigning) a recipe onto a day/slot is a `POST /plans` with that `recipeId`.

**Weekly nutrition summary (AD-6, FR-5, Nice to Have).** `GET /plans/summary?weekStart=` aggregates **macros only** (calories, protein, carbs, fat, fiber — not micronutrients) across the week's recipe-based entries, server-side, via the shared `nutrition-engine` summed on **unrounded per-serving** values and rounded only at display (holistic AD-3, F-20). Micronutrients/%DV are not aggregated at the weekly level (%DV does not sum across differing reference amounts; spec AC-5.1). Freeform meals (and recipe tombstones) carry no nutrition and are **flagged as excluded** so the user sees what is and is not counted (AC-5.2).

## Findings

> Summary table — full content in `references/research.md`. Partitioned from the holistic design.

| ID | Title | Source | Confidence | Related FRs | Summary |
| --- | --- | --- | --- | --- | --- |
| F-1 | Prototype is React; planner components port directly | codebase | high | FR-1,2,3,4 | The prototype's week grid, day cells, detail view, and edit-mode layout port into a responsive React Weekly Planner view. |
| F-2 | Prototype DnD is HTML5 — fails on touch | codebase | high | FR-4, NFR-2 | `draggable`/`dataTransfer`/`onDrop` do not fire for touch input, so AC-4.4 cannot be met by porting the prototype; it must be rebuilt. |
| F-3 | dnd-kit unifies mouse/touch/keyboard + tap fallback | web_research | high | FR-4, NFR-2 | One PointerSensor with a touch activation delay + a keyboard sensor supports touch/mouse/keyboard; a tap-to-assign fallback de-risks mobile drag-vs-scroll. |
| F-4 | TanStack Query keyed by week makes navigation instant | web_research | high | FR-1,2,3 | Caching/dedup/retry/loading/error out of the box; week-keyed queries make back/forward navigation immediate from cache (NFR-1). |
| F-11 | Prototype week-key has ISO/year-boundary bug | codebase | high | FR-3 | Identify a week by the Monday's DATE server-side; do not port the `YYYY-Www` string logic; range-query by date for history. |
| F-12 | plan_entries is the only new table; XOR recipe/freeform | training_knowledge | medium | FR-1,3 | One `plan_entries` table keyed by week_start_date + day_of_week + meal_slot + position; a row is a recipe ref OR a freeform meal (XOR CHECK). Corroborated against the prototype's data shapes, not live-verified. |
| F-20 | Round-at-display; aggregate macros, not %DV | codebase | high | FR-5 | The weekly summary sums full-precision per-serving macros and rounds only at display; %DV/micronutrients do not aggregate across ingredients, so the weekly summary is macros-only. |

## Architecture Decisions

### AD-1: `plan_entries` as a feature migration (0003) on the platform baseline

- **Context**: The planner needs to persist, per week, which meal occupies each day/slot, where a meal is either a saved recipe or a freeform entry. The baseline (`0001`) seeds `workspaces`/`units`; `recipe-library` (`0002`) owns recipes/ingredients/tags. The planner must not redefine any of those.
- **Decision**: We will add migration `0003_weekly_planner.sql` creating a single `plan_entries` table: `id`, `workspace_id NOT NULL` FK (platform convention), `week_start_date DATE NOT NULL` (the Monday, AD-2), `day_of_week SMALLINT NOT NULL CHECK 0..6`, `meal_slot` enum/`CHECK` in `{breakfast,lunch,dinner,snack}`, `position INT NOT NULL DEFAULT 0`, a nullable `recipe_id` FK to `recipes(id) ON DELETE SET NULL` (AD-3), and `freeform_title`/`freeform_description`/`freeform_link`. A XOR `CHECK` enforces exactly one of {recipe_id present} / {freeform_title present}. Add matching Drizzle models in `apps/api/src/db/schema.ts` (reusing the baseline + recipe-library models; not redefining them).
- **Rationale**: One table is sufficient — a plan entry is a thin association of (week, day, slot, position) to a recipe-or-freeform meal (F-12). A DB-level XOR CHECK makes a malformed entry impossible to persist (defence in depth alongside the Zod boundary). Indexing `(workspace_id, week_start_date)` makes the week query and history range-query fast (NFR-1).
- **Alternatives Considered**: A `plan_weeks` parent table plus child entries — rejected as needless normalization for MVP; the week is fully derivable from `week_start_date` on each entry. Two tables (recipe-entries vs freeform-entries) — rejected: the slot semantics are identical and a single table with a XOR CHECK keeps ordering/queries uniform. Storing meals as a JSONB blob per week — rejected: loses the recipe FK / tombstone integrity (AD-3).

### AD-2: Identify a week by `week_start_date` (the Monday's DATE)

- **Context**: FR-3 needs reliable week navigation and history. The prototype's `YYYY-Www` string is not ISO-compliant and breaks at year boundaries (holistic F-11). This is the holistic AD-6 decision, scoped here.
- **Decision**: We will store `week_start_date DATE` (the Monday) on every plan entry, computed server-side from any date in the week, and range-query / shift it by 7 days for navigation and history.
- **Rationale**: A Monday DATE is unambiguous, timezone-independent, sortable, and trivially range-queryable, sidestepping the ISO 53-week/year-boundary bugs the prototype demonstrates (F-11). Forward/back navigation is `weekStart +/- 7 days` — no week-number arithmetic.
- **Alternatives Considered**: ISO `YYYY-Www` string (prototype) — rejected (demonstrated boundary bug). `isoyear`+`isoweek` integer pair — viable but a DATE is simpler to range-query and to shift by 7 days.

### AD-3: Recipe-or-freeform meals; recipe deletion leaves a tombstone (ON DELETE SET NULL)

- **Context**: FR-1 allows a planned meal to be a saved recipe or a freeform entry (title/description/optional link). Recipes are owned by `recipe-library` and can be deleted there; a deleted recipe must not erase or orphan the planned slot (spec Assumption).
- **Decision**: We will make `plan_entries.recipe_id` a nullable FK with `ON DELETE SET NULL`, paired with a XOR `CHECK` (a row is recipe-backed or freeform, never both/neither). When a referenced recipe is deleted, the entry's `recipe_id` becomes NULL and the UI renders a clear "recipe removed" tombstone rather than dropping the slot. `POST /plans` accepts `{ recipeId }` XOR `{ freeformTitle, freeformDescription?, freeformLink? }`.
- **Rationale**: `ON DELETE SET NULL` preserves the user's planning intent and history when a recipe is later deleted, instead of cascading the plan slot away (holistic contracts note). The XOR CHECK keeps the two meal kinds mutually exclusive at the DB level.
- **Alternatives Considered**: `ON DELETE CASCADE` — rejected: silently deletes planned slots and corrupts past-week history. `ON DELETE RESTRICT` — rejected: blocks legitimate recipe deletion in `recipe-library`. Snapshotting the recipe name/nutrition into the plan entry at assign time — heavier than needed for MVP; the tombstone + live recipe read (FR-2) is sufficient.

### AD-4: Planner server state via TanStack Query, keyed by week

- **Context**: The planner reads a week's entries, navigates between weeks, opens a detail view, and writes plan edits. Navigation should feel immediate and a week should not refetch needlessly (NFR-1). This is the holistic AD-10 decision, scoped to the planner.
- **Decision**: We will manage planner server state with TanStack Query — `useQuery` for the week's plan keyed by `week_start_date` and for the optional `/plans/summary`; `useMutation` + `invalidateQueries`/`setQueryData` for add/edit/remove. The detail view reads the recipe via the `recipe-library` `useRecipe`/`GET /recipes/:id` path for notes/link/nutrition.
- **Rationale**: Automatic caching/dedup/retry/loading/error with little code, and week-keyed caching makes back/forward navigation instant (F-4), supporting NFR-1 and the error-surfacing ACs (AC-1.6, AC-3.4). Reusing `recipe-library`'s recipe query for the detail view avoids duplicating nutrition logic on the client.
- **Alternatives Considered**: Plain fetch + Context — re-implements caching/loading/error per surface and has no per-week cache; rejected given the navigation/history volume. Refetching the whole week on every keystroke of an edit — laggy; mutations target the keyed week instead.

### AD-5: Drag-and-drop via dnd-kit with touch activation + tap-to-assign fallback

- **Context**: FR-4/AC-4.4 require a drag-and-drop edit mode that works on touch; the prototype's HTML5 DnD does not fire on touch (F-2); the two-panel edit view (filterable recipe palette + week) must collapse on mobile (NFR-2). This is the holistic AD-9 decision, scoped to the planner.
- **Decision**: We will use dnd-kit (`useDraggable` recipe cards + `useDroppable` day/slot targets) with a `PointerSensor` configured with a **touch activation delay** (and tolerance) plus a mouse distance threshold, a **keyboard sensor** for a11y, and a **tap-to-assign fallback** on mobile (tap a recipe, then tap a day/slot). The edit layout is a CSS two-column grid (>=768px) collapsing to a single column with the recipe palette as a drawer. The palette is filtered via `recipe-library`'s `GET /recipes?mealType=&tag=` (its existing filters, AC-4.2). A drop / tap-assign performs `POST /plans` with the dragged `recipeId` (AC-4.3/AC-4.4).
- **Rationale**: dnd-kit gives unified mouse/touch/keyboard with WCAG-aligned a11y and GPU-transform performance (F-3), directly satisfying AC-4.4 and NFR-2; the touch activation delay resolves the drag-vs-scroll conflict and the tap fallback de-risks the known mobile drag problem. Reusing the recipe-library filters avoids reimplementing filtering in the planner.
- **Alternatives Considered**: Port the prototype's HTML5 DnD — rejected (no touch; AC-4.4 unmet). react-dnd with HTML5+touch backends — viable but needs backend-switching and has weaker a11y. JS-driven layout switching instead of CSS — rejected in favor of pure CSS breakpoints.

### AD-6: Weekly nutrition summary aggregates macros only, via the shared engine on unrounded values

- **Context**: FR-5 (Nice to Have) wants a sense of how healthy the planned week's eating is overall. Micronutrients are stored as absolute mass and %DV does not sum across ingredients with differing reference amounts; the spec scopes the weekly summary to macros only (AC-5.1). Freeform meals carry no nutrition.
- **Decision**: We will expose `GET /plans/summary?weekStart=` that, server-side, sums **macros only** (calories, protein_g, carbs_g, fat_g, fiber_g) across the week's recipe-based entries using the shared `nutrition-engine` on **unrounded per-serving** values, rounding only at display (holistic AD-3/F-20). Freeform entries and recipe tombstones are excluded and reported in an `excluded`/flag field so the UI can state what is not counted (AC-5.2). Micronutrients are not aggregated at the weekly level.
- **Rationale**: Summing unrounded values avoids the prototype's compounding rounding error (F-20); macros-only matches the spec and side-steps the non-summability of %DV/micronutrients (AC-5.1). Reusing the engine keeps weekly totals consistent with per-recipe totals (one implementation).
- **Alternatives Considered**: Aggregate micronutrients/%DV too — rejected: %DV is not additive across differing reference amounts (holistic AD-3 deviation). Compute the summary client-side by summing already-rounded per-recipe displays — rejected: compounding error and duplicated logic. Materialize a per-week summary table — rejected: single-workspace volumes are small enough to compute on read.

## Resolved Uncertainties

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 1 | How is a week identified for history/navigation? | The Monday's DATE (`week_start_date`), computed server-side; range-query / shift by 7 days (AD-2). | F-11; holistic AD-6 |
| 2 | One table or many for plans? | One `plan_entries` table; a row is recipe-backed OR freeform via a XOR CHECK (AD-1). | F-12 |
| 3 | What happens to a planned meal when its recipe is deleted? | `recipe_id` becomes NULL (`ON DELETE SET NULL`); the entry survives as a tombstone (AD-3). | spec Assumption; holistic contracts |
| 4 | Which DnD approach works on touch? | dnd-kit PointerSensor (touch activation delay) + keyboard sensor + tap-to-assign fallback (AD-5). | F-2, F-3; holistic AD-9 |
| 5 | How does week navigation feel instant? | TanStack Query keyed by `week_start_date`; cached weeks render immediately (AD-4). | F-4; holistic AD-10 |
| 6 | Does the weekly summary aggregate micros? | No — macros only, summed on unrounded per-serving values via the shared engine (AD-6). | F-20; AC-5.1 |
| 7 | Where do recipe notes/link/nutrition in the detail view come from? | Read live from `recipe-library` `GET /recipes/:id` (shared engine computes nutrition) (AD-4). | recipe-library contracts |

## Standards

> Full inventory in `references/standards.md`.

| ID | Rule | Domain | File Type | Action Type | Source |
| --- | --- | --- | --- | --- | --- |
| S-1 | Validate API inputs/outputs with shared Zod schemas (incl. the XOR recipe/freeform rule) | api-design | .ts | create | platform AD-1/AD-2 |
| S-2 | Use Drizzle/parameterized queries; never concatenate SQL | security | .ts, .sql | * | platform AD-3 |
| S-3 | Schema changes go through versioned drizzle-kit migrations on the platform baseline | other | .sql, .ts | create | platform AD-3 |
| S-4 | Identify a week by the Monday DATE computed server-side; never an ISO week string | other | .ts | create | AD-2, F-11 |
| S-5 | Round nutrition only at display; aggregate macros (not %DV) on unrounded values | other | .ts, .tsx | create | AD-6, F-20 |
| S-6 | Drag-and-drop must support touch + keyboard with a tap fallback (dnd-kit), not HTML5 DnD | other | .tsx | create | AD-5, NFR-2 |
| S-7 | No emojis | other | * | * | global CLAUDE.md |

## File Inventory

| Action | Path | Related FRs | Rationale |
| --- | --- | --- | --- |
| modify | packages/shared/src/types.ts | FR-1,2,3 | PlanEntry / PlanEntryInput / WeeklySummary types |
| modify | packages/shared/src/schemas.ts | FR-1,3 | Zod schemas for plan payloads incl. the XOR recipe/freeform refinement (S-1) |
| create | apps/api/drizzle/0003_weekly_planner.sql | FR-1,3 | Feature migration: plan_entries (week_start_date, day_of_week, meal_slot, position, recipe_id ON DELETE SET NULL, freeform_*, XOR CHECK) (AD-1) |
| modify | apps/api/src/db/schema.ts | FR-1,3 | Drizzle model for plan_entries (reuses baseline + recipe-library models) |
| create | apps/api/src/routes/plans.ts | FR-1,2,3,5 | Plan CRUD, week range/history, weekly summary (AD-1..AD-6) |
| modify | apps/api/src/server.ts | FR-1 | Register the plans routes under /api/v1 |
| create | apps/web/src/views/WeeklyPlanner.tsx | FR-1,2,3,4 | Weekly Planner view (week grid, navigation, edit mode) filling the /planner placeholder (AD-4,5) |
| create | apps/web/src/components/PlannedMealDetail.tsx | FR-2 | Detail view: freeform notes/link or recipe notes/link/nutrition (AD-4) |
| create | apps/web/src/components/RecipePalette.tsx | FR-4 | Filterable recipe palette (left panel) reusing recipe-library filters (AD-5) |
| create | apps/web/src/components/WeekGrid.tsx | FR-1,4 | Day x slot grid with droppable day/slot targets (AD-5) |
| create | apps/web/src/components/WeeklyNutritionSummary.tsx | FR-5 | Macros-only weekly summary with excluded-meals flag (AD-6) |
| create | apps/web/src/query/plans.ts | FR-1,2,3,5 | TanStack Query hooks keyed by week_start_date (AD-4) |

## Dependencies and Coupling

| Feature Area | Shared Files | Recommendation |
| --- | --- | --- |
| FR-1,3 (contract) | `packages/shared/*` | Extend shared types + Zod (incl. the XOR refinement) for plan payloads before routes/UI; both apps import them. |
| FR-1,3 (schema) | `apps/api/drizzle/0003_weekly_planner.sql`, `apps/api/src/db/schema.ts` | Land migration `0003` (on baseline `0001`, alongside recipe-library `0002`) before routes; plan CRUD/history depend on it. The walking-skeleton seed. |
| FR-1,2,3,5 (plan API) | `apps/api/src/routes/plans.ts`, `apps/api/src/server.ts` | Plan CRUD, week range query, and the summary all live in `plans.ts`; register once in `server.ts`. |
| FR-1,2,3 (planner UI) | `apps/web/src/views/WeeklyPlanner.tsx`, `apps/web/src/query/plans.ts` | UI depends on the plan routes + the recipe-library recipe read (detail view); sequence after the API. |
| FR-4 (edit mode) | `apps/web/src/components/RecipePalette.tsx`, `WeekGrid.tsx` | dnd-kit edit mode reuses recipe-library `GET /recipes` filters; build after the week view exists. |

> Upstream dependencies: `platform-foundation` (monorepo, shared package, DB baseline + units, server skeleton, workspace resolution, `/planner` route shell) AND `recipe-library` (recipe tables in `0002`, `GET /recipes` + filters, `GET /recipes/:id` with nutrition, the shared `nutrition-engine`) must be in place. This spec adds only `plan_entries` and the planner surface; it must NOT redefine the platform tables (`workspaces`/`units`) or the recipe-library tables (`recipes`/`ingredients`/`tags`).

## Spec Deviations

None — all spec values are preserved (Mon-Sun week, all four meal slots, Monday-DATE week identity, recipe-or-freeform XOR, ON DELETE SET NULL tombstones, touch drag with tap fallback, macros-only weekly summary).

## Open Questions

Resolved upstream during the originating spec: a week is identified by its Monday DATE; the weekly summary aggregates macros only. Non-blocking, deferred to implementation:
- The exact touch activation delay/tolerance for the dnd-kit PointerSensor — to be tuned against a real device so a touch-drag is reliably distinguished from a scroll (AD-5, NFR-2).
- Whether the weekly summary is per-day-and-week or week-total only — the spec asks for the week total (AC-5.1); a per-day breakdown is an optional display enhancement, not a binding design value.

## Constraints (Technical)

| Constraint | Category | Source | Rationale |
| --- | --- | --- | --- |
| A week is identified by the Monday DATE, not an ISO week string | compatibility | technical | Avoids the prototype's year-boundary bug; enables date range-query for history (AD-2, F-11) |
| Builds on platform-foundation AND recipe-library; must not redefine their tables | infrastructure | technical | Feature migration `0003` extends baseline `0001`; recipes live in `0002` (AD-1) |
| Drag-and-drop must work on touch | compatibility | technical | AC-4.4/NFR-2; HTML5 DnD does not fire on touch, forcing dnd-kit + tap fallback (AD-5, F-2) |
| %DV / micronutrients are not summable across ingredients | performance | technical | The weekly summary is macros-only on unrounded values (AD-6, F-20) |

## Assumptions

| Assumption | Source | Affects |
| --- | --- | --- |
| The planner grid includes all four meal slots (breakfast/lunch/dinner/snack) | spec | FR-1, FR-4 |
| Deleting a referenced recipe leaves the plan entry as a tombstone (ON DELETE SET NULL) | spec | FR-1 |
| Single-workspace plan volumes are small enough to compute the weekly summary on read (no materialized cache) | design | FR-5 |
| `recipe-library`'s `GET /recipes` filters and `GET /recipes/:id` nutrition are available for the palette and detail view | design | FR-2, FR-4 |

## Risks (Technical)

| Risk | Impact | Probability | Mitigation | Affects |
| --- | --- | --- | --- | --- |
| Porting prototype DnD verbatim would silently ship a planner broken on touch | high | medium | Rebuild on dnd-kit (touch activation + keyboard) with a tap-to-assign fallback; e2e touch emulation (AD-5, S-6) | FR-4, NFR-2 |
| Week-boundary bugs in history navigation (ISO 53-week/year edges) | medium | medium | Identify weeks by the Monday DATE; range-query / shift by 7 days; test year-boundary weeks (AD-2, S-4) | FR-3 |
| Touch-drag conflicts with page scroll on mobile, making assignment fiddly | medium | medium | PointerSensor touch activation delay + tolerance; tap-to-assign fallback (AD-5) | FR-4, NFR-2 |
| Cascade-deleting a recipe would erase planned slots and corrupt history | high | low | `ON DELETE SET NULL` tombstone + UI "recipe removed" state, never cascade (AD-3) | FR-1 |
| Summing already-rounded per-recipe values would compound error in the weekly total | medium | low | Sum unrounded per-serving macros via the shared engine; round only at display (AD-6, F-20) | FR-5 |
| Aggregating %DV/micronutrients at the week level would be misleading | medium | low | Macros-only weekly summary; micronutrients excluded by design (AD-6) | FR-5 |

## References

- See `references/research.md` for full findings (partitioned from the holistic design)
- See `references/standards.md` for the complete standards inventory
- See `references/contracts.md` for the `/plans` REST contract
