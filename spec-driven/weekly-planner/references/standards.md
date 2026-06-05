# Standards Inventory: weekly-planner

No project-level `CLAUDE.md` yet (greenfield). Standards derive from the design's binding decisions, the `platform-foundation` and `recipe-library` standards, and the user's global `CLAUDE.md`.

---

## S-1: Validate API inputs/outputs with shared Zod schemas (incl. the XOR recipe/freeform rule)
- **Domain**: api-design
- **File Type**: .ts
- **Action Type**: create
- **Source**: platform-foundation AD-1/AD-2

Plan payloads are validated at the boundary against shared Zod schemas in `packages/shared`. The schema enforces that a plan entry carries **either** a `recipeId` **or** a freeform meal (`freeformTitle` + optional description/link), never both or neither (the XOR rule, AD-3), in addition to `dayOfWeek` 0..6 and the `mealSlot` enum.

## S-2: Use Drizzle/parameterized queries; never concatenate SQL
- **Domain**: security
- **File Type**: .ts, .sql
- **Action Type**: * (all)
- **Source**: platform-foundation AD-3

## S-3: Schema changes go through versioned drizzle-kit migrations on the platform baseline
- **Domain**: other
- **File Type**: .sql, .ts
- **Action Type**: create
- **Source**: platform-foundation AD-3

The weekly-planner migration is `0003_weekly_planner.sql`, extending baseline `0001` (and coexisting with recipe-library `0002`). It must not redefine `workspaces`/`units` or the recipe-library tables (`recipes`/`ingredients`/`tags`). It adds only `plan_entries`.

## S-4: Identify a week by the Monday DATE computed server-side; never an ISO week string
- **Domain**: other
- **File Type**: .ts
- **Action Type**: create
- **Source**: AD-2, F-11

`week_start_date` is the Monday `DATE`, computed server-side from any date in the week. Navigation and history shift / range-query by 7-day boundaries. The prototype's `YYYY-Www` string logic must not be ported (year-boundary bug).

## S-5: Round nutrition only at display; aggregate macros (not %DV) on unrounded values
- **Domain**: other
- **File Type**: .ts, .tsx
- **Action Type**: create
- **Source**: AD-6, F-20

The weekly summary sums full-precision per-serving macros via the shared `nutrition-engine` and rounds only at display. Micronutrients/%DV are not aggregated at the weekly level (not summable across differing reference amounts). Freeform meals and recipe tombstones are flagged as excluded, never zero-counted.

## S-6: Drag-and-drop must support touch + keyboard with a tap fallback (dnd-kit), not HTML5 DnD
- **Domain**: other
- **File Type**: .tsx
- **Action Type**: create
- **Source**: AD-5, NFR-2

The edit-mode DnD uses dnd-kit (`PointerSensor` with a touch activation delay + a `KeyboardSensor`) and provides a tap-to-assign fallback on mobile. Native HTML5 DnD must not be used (it does not fire on touch).

## S-7: No emojis
- **Domain**: other
- **File Type**: * (all)
- **Action Type**: * (all)
- **Source**: global `CLAUDE.md`
