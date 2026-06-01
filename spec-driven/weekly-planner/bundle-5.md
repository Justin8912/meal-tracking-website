# Bundle 5: Drag-and-Drop Edit Mode

> Slice 2: Feature Depth (Stage: depth)
> Stage: depth | Parallel: no (extends WeeklyPlanner.tsx from Bundle 1; adds RecipePalette/WeekGrid) | Files: apps/web/src/components/RecipePalette.tsx, apps/web/src/components/WeekGrid.tsx, apps/web/src/views/WeeklyPlanner.tsx

**Bundle Verify**: Edit mode shows a filterable recipe palette (left) and the week (right); dragging a recipe onto a day assigns it; the assignment also works via a usable touch interaction (tap-to-assign fallback).
- **Level**: e2e
- **Given**: the API (Bundles 1-2) running with recipes available (recipe-library)
- **Action**: toggle edit mode, filter the palette by meal type/tag, drag a recipe onto a day, then assign via touch/tap on a narrow viewport
- **Outcome**: the edit layout appears; the palette narrows on filter; the dragged recipe is assigned to the day; touch/tap assignment works (NFR-2)

> **Context**
>
> **Applicable ACs**
> - **AC-4.1**: Given: the Weekly Planner / When: I click the edit button / Then: the edit layout appears with the recipe list on the left and the week on the right
> - **AC-4.2**: Given: the edit layout / When: I filter the recipe list by meal type or tag / Then: the recipe list narrows accordingly
> - **AC-4.3**: Given: the edit layout with recipes listed / When: I drag a recipe onto a specific day / Then: that recipe is assigned to that day
> - **AC-4.4**: Given: the edit layout on a touch device / When: I drag a recipe with touch / Then: the assignment works via a usable touch interaction (see NFR-2)
>
> **Architecture Decisions**
> - **AD-5: Drag-and-drop via dnd-kit with touch activation + tap-to-assign fallback** — Decision: dnd-kit PointerSensor (touch activation delay) + KeyboardSensor; two-panel layout collapsing to a drawer; tap-to-assign fallback; palette filtered via recipe-library GET /recipes filters; a drop/tap = POST /plans `{recipeId}`. Rationale: unified touch/mouse/keyboard (AC-4.4); reuse recipe-library filters (AC-4.2).
> - **AD-4: Planner server state via TanStack Query keyed by week** — Decision: an assignment mutation updates the active week's query.
>
> **Findings**
> - **F-2: Prototype DnD is HTML5 — fails on touch** — must rebuild on dnd-kit, not port.
> - **F-3: dnd-kit unifies mouse/touch/keyboard + tap fallback** — PointerSensor touch activation distinguishes drag from scroll; tap fallback de-risks mobile.
>
> **Standards**
> - **S-6**: Drag-and-drop must support touch + keyboard with a tap fallback (dnd-kit), not HTML5 DnD (Domain: other | File Type: .tsx)
> - **S-1**: Validate API inputs/outputs with shared Zod schemas (Domain: api-design | File Type: .ts)
> - **S-7**: No emojis (Domain: other | File Type: *)
>
> **Contracts**
> - GET /recipes?mealType=&tag= (recipe-library) — the filterable palette
> - POST /plans `{recipeId}` — assign a dragged/tapped recipe to a day/slot
>
> **Risks**
> - Touch-drag conflicts with page scroll on mobile (Impact: medium | Mitigation: PointerSensor touch activation delay + tap-to-assign fallback)

#### STEP-17: Test-first — edit mode toggle + filterable palette
MANUAL -> Test-first for STEP-18

> **Intent**: AC-4.1 requires a distinct edit layout (palette left, week right); AC-4.2 requires the palette to narrow on a meal-type/tag filter. The palette must reuse recipe-library's server-side `GET /recipes` filters via the query key (not client-side array filtering) so it stays consistent and scales. Tests must assert the toggle reveals the two-panel layout and that selecting a meal-type/tag updates the palette query and renders only matching recipes.

- Write component tests: clicking edit reveals the two-panel layout (palette + week); selecting a tag and a meal-type updates the palette's recipes query key and renders only the filtered recipes (mocked responses)
- Tests fail before STEP-18

**Verify**:
- Level: unit | Given: the edit-mode/filter test | Action: run before STEP-18 | Outcome: fail (edit mode/palette not implemented)

> Depends on: STEP-6 | Enables: STEP-18 | Parallel with: —

#### STEP-18: Edit-mode toggle, two-panel layout, filterable recipe palette
[FR-4 -> AC-4.1, AC-4.2] | create `apps/web/src/components/RecipePalette.tsx`; modify `apps/web/src/views/WeeklyPlanner.tsx` | Effort: M

> **Intent**: An edit button toggles a two-panel layout — the filterable recipe palette on the left, the week on the right (AC-4.1). The palette reuses recipe-library's `GET /recipes` with its `mealType`/`tag` filters driven through the TanStack Query key (AC-4.2, recipe-library AD-6) so filtering is server-side and consistent. The layout is a CSS two-column grid (>=768px) collapsing to a single column with the palette as a drawer on phones (NFR-2). dnd-kit drag wiring is STEP-20; this step establishes the layout, palette, and filters.
> **Standards**: S-1, S-7

- Add an edit-mode toggle to WeeklyPlanner that switches to a two-column layout (palette left, week right)
- Build RecipePalette using recipe-library's recipe query with mealType/tag filter controls (filters set in the query key)
- Make the layout responsive: two columns >=768px, single column + palette drawer below (NFR-2)

**Verify**:
- Level: integration | Given: the Weekly Planner | Action: click edit, then filter the palette by tag and meal type | Outcome: the two-panel edit layout appears (palette left, week right) (AC-4.1); the palette narrows to matching recipes via the server filter (AC-4.2) — STEP-17 tests pass

> Depends on: STEP-17, STEP-6 | Enables: STEP-20 | Parallel with: —

#### STEP-19: Test-first — drag/tap assign (incl. touch)
MANUAL -> Test-first for STEP-20

> **Intent**: AC-4.3/AC-4.4 are the core of edit mode and the highest-risk piece: HTML5 DnD fails on touch (F-2), and a touch-drag can be mistaken for a scroll. Tests must assert a dnd-kit drop assigns the recipe to the target day/slot (POST /plans `{recipeId}`), that the keyboard sensor allows assignment for a11y, and that the tap-to-assign fallback (tap recipe, tap day/slot) assigns on touch — verifying AC-4.4 without relying on raw HTML5 drag events.

- Write tests: a dnd-kit drop of a recipe onto a day/slot fires an assignment (POST /plans recipeId, mocked); keyboard-driven move assigns; tap-to-assign (tap recipe then tap day/slot) assigns on a touch/narrow viewport
- Tests fail before STEP-20

**Verify**:
- Level: unit | Given: the drag/tap-assign test | Action: run before STEP-20 | Outcome: fail (DnD/tap not implemented)

> Depends on: STEP-18 | Enables: STEP-20 | Parallel with: —

#### STEP-20: dnd-kit drag-to-day + touch activation + tap-to-assign fallback
[FR-4 -> AC-4.3, AC-4.4] | create `apps/web/src/components/WeekGrid.tsx`; modify `apps/web/src/views/WeeklyPlanner.tsx` | Effort: L

> **Intent**: Make recipe cards draggable (`useDraggable`) and day/slot cells droppable (`useDroppable`) via dnd-kit, with a `PointerSensor` configured with a touch activation delay + tolerance (so a touch-drag is distinguished from a page scroll — the central touch risk), a mouse distance threshold, and a `KeyboardSensor` for a11y (S-6). On drop, assign the recipe to that day/slot via the week-keyed mutation (POST /plans `{recipeId}`, AC-4.3). Provide a tap-to-assign fallback on touch (tap a recipe to select, tap a day/slot to place) so mobile users are never forced into a fiddly drag (AC-4.4, NFR-2). Never use native HTML5 DnD (F-2).
> **Standards**: S-6, S-1, S-7

- Build WeekGrid with droppable day/slot targets; make RecipePalette cards draggable via dnd-kit
- Configure DndContext sensors: PointerSensor (touch activation delay + tolerance; mouse distance) + KeyboardSensor
- On drop/keyboard-drop, POST /plans `{recipeId}` for the target day/slot via the week-keyed mutation
- Add a tap-to-assign fallback (select recipe -> tap day/slot) for touch

**Verify**:
- Level: e2e | Given: edit mode with recipes in the palette | Action: drag a recipe onto a day/slot | Outcome: that recipe is assigned to that day (AC-4.3)
- Level: e2e | Given: edit mode on a touch/narrow viewport | Action: drag with touch, or use tap-to-assign | Outcome: the assignment works via the touch interaction; a touch-drag is not swallowed by page scroll (AC-4.4, NFR-2) — STEP-19 tests pass

> Depends on: STEP-19, STEP-18 | Enables: STEP-24 | Parallel with: —
