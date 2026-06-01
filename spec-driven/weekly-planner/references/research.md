# Research Results: weekly-planner

Findings partitioned from the holistic `spec-driven/meal-tracking-mvp/design.md` (via `--context`) to the weekly-planner scope, building on the finalized `platform-foundation` and `recipe-library`. No new research subagents were dispatched. See the holistic `references/research.md` for the original aspect-level detail (Aspect 1 frontend/DnD and Aspect 3 schema/week-identity are the primary sources here).

---

## Aspect — Planner UI & drag-and-drop

### Findings

#### F-1: Prototype is React; planner components port directly
- **Source**: codebase
- **Confidence**: high
- **Related**: FR-1, FR-2, FR-3, FR-4
- The prototype's week grid, per-day cells, planned-meal detail view, week navigation, and edit-mode two-panel layout port into a responsive React Weekly Planner view. Only persistence (`window.storage`) and the DnD mechanism are replaced.

#### F-2: Prototype DnD is HTML5 — fails on touch
- **Source**: codebase
- **Confidence**: high
- **Related**: FR-4, NFR-2
- `draggable`/`dataTransfer`/`onDrop` do not fire for touch input, so AC-4.4 (touch drag on mobile) cannot be met by porting the prototype. The DnD must be rebuilt on a pointer/touch-capable library.

#### F-3: dnd-kit unifies mouse/touch/keyboard + tap fallback
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-4, NFR-2
- One `PointerSensor` with activation constraints supports touch (activation delay + tolerance, distinguishing drag from scroll) and mouse (distance threshold); a `KeyboardSensor` adds a11y. A tap-to-assign fallback (tap recipe, tap day/slot) de-risks the known mobile drag-vs-scroll problem.

## Aspect — Plan schema & week identity

#### F-11: Prototype week-key has ISO/year-boundary bug
- **Source**: codebase
- **Confidence**: high
- **Related**: FR-3
- The prototype identifies a week with a `YYYY-Www` string that is not ISO-compliant and breaks at year boundaries (53-week years, week-1 ownership). Identify a week by the Monday's `DATE` server-side and range-query / shift by 7 days for navigation and history.

#### F-12: plan_entries is the only new table; XOR recipe/freeform
- **Source**: training_knowledge
- **Confidence**: medium
- **Related**: FR-1, FR-3
- One `plan_entries` table keyed by `week_start_date` + `day_of_week` (0..6) + `meal_slot` (breakfast/lunch/dinner/snack) + `position`; a row references either a recipe (`recipe_id`, `ON DELETE SET NULL`) or a freeform meal (`freeform_title`/`description`/`link`), enforced by a XOR CHECK. Corroborated against the prototype's data shapes, not live-verified.

## Aspect — Server state & nutrition aggregation

#### F-4: TanStack Query keyed by week makes navigation instant
- **Source**: web_research
- **Confidence**: high
- **Related**: FR-1, FR-2, FR-3
- Caching/dedup/retry/loading/error out of the box; a query keyed by `week_start_date` means revisiting a week renders immediately from cache, satisfying NFR-1. Mutations target the active week's query (invalidate/optimistic update).

#### F-20: Round-at-display; aggregate macros, not %DV
- **Source**: codebase
- **Confidence**: high
- **Related**: FR-5
- The prototype rounds per-serving mid-calc and sums already-rounded values (compounding error). The weekly summary instead sums full-precision per-serving macros via the shared `nutrition-engine` and rounds only at display. Micronutrients are stored as absolute mass and %DV does not sum across differing reference amounts, so the weekly summary is macros-only.

### Approaches Evaluated

**Preferred: single `plan_entries` table (Monday-DATE week key, recipe/freeform XOR, ON DELETE SET NULL tombstone) + `/plans` Fastify routes + dnd-kit edit mode + TanStack Query keyed by week + macros-only summary via the shared engine.** See ADs 1-6. References: holistic design AD-6/AD-9/AD-10/AD-3; recipe-library design AD-1 (shared engine) / AD-6 (recipe filters); https://docs.dndkit.com/; https://tanstack.com/query/latest; https://orm.drizzle.team/

**Viable: snapshot the recipe's nutrition/name into the plan entry at assign time.** Would let the detail view and weekly summary run without reading recipe-library, but is heavier than needed for MVP; the tombstone + live recipe read (FR-2) suffices.

**Not recommended: port HTML5 DnD / ISO `YYYY-Www` week string / `ON DELETE CASCADE` for recipes / aggregate %DV at the week level.** No touch support / year-boundary bug / erases planned slots and history / %DV is not additive, respectively.

### Resolved Uncertainties

| Question | Answer | Evidence |
| --- | --- | --- |
| Week identity? | The Monday's DATE, computed server-side; range-query / shift by 7 days | F-11 |
| One table or many? | One `plan_entries` table; recipe OR freeform via a XOR CHECK | F-12 |
| Recipe deleted while planned? | `recipe_id` set NULL (`ON DELETE SET NULL`); entry survives as a tombstone | F-12; holistic contracts |
| DnD on touch? | dnd-kit PointerSensor (touch activation) + keyboard sensor + tap fallback | F-2, F-3 |
| Instant navigation? | TanStack Query keyed by `week_start_date` | F-4 |
| Weekly summary scope? | Macros only, summed on unrounded per-serving values via the shared engine | F-20 |

### Remaining Uncertainties
- Exact touch activation delay/tolerance for the PointerSensor — tune against a real device during implementation.
- Whether the weekly summary shows a per-day breakdown in addition to the week total — the spec asks for the week total; a per-day view is an optional display enhancement.
