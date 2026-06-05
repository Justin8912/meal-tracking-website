# Progress: Bundle 5 — Drag-and-Drop Edit Mode

> Tasks: spec-driven/weekly-planner/bundle-5.md | Bundle: 5 | Branch: impl/weekly-planner/bundle-5 | Last Updated: 2026-06-01

Progress: 4/4 steps complete

## Current State

- Stage: depth
- Last completed: STEP-20 — dnd-kit drag-to-day + touch activation + tap-to-assign fallback
- Next up: none (bundle complete; enables STEP-24)
- Blockers: none

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-17 | done | d935a9f | Test-first: edit-mode toggle (two-panel) + palette meal-type/tag filter via query key |
| STEP-18 | done | 0c143c8 | Edit-mode toggle, responsive two-panel layout, filterable RecipePalette (server filters) |
| STEP-19 | done | 77e3c84 | Test-first: tap-to-assign + dnd-kit sensor structural checks; installed @dnd-kit/core 6.3.1 |
| STEP-20 | done | 768190f | dnd-kit drag-to-day + PointerSensor touch activation + KeyboardSensor + tap-to-assign fallback |

## Verification

- Per-workspace `npx tsc --noEmit` (apps/web): clean.
- Full `npm test` (apps/web vitest): 20 files, 56 tests passing (50 prior + 6 new across editmode/assign/sensors). No prior bundle regressed.
- `vite build`: succeeds (97 modules; dist emitted).
- Bundle Verify result:
  - AC-4.1 (edit toggle reveals two-panel layout, palette left + week right) — verified deterministically (WeeklyPlanner.editmode.test.tsx).
  - AC-4.2 (palette narrows via the server-side GET /recipes filter through the TanStack Query key, meal type + tag) — verified deterministically (WeeklyPlanner.editmode.test.tsx).
  - AC-4.3 (assigning a recipe to a day/slot fires POST /plans {recipeId} for that exact day/slot) — the ASSIGNMENT path is verified deterministically via the tap-to-assign fallback (WeeklyPlanner.assign.test.tsx); the recipe-only XOR body is asserted (S-1). The LIVE pointer/touch DRAG gesture itself is wired (useDraggable/useDroppable + onDragEnd resolving to the same assign()) and asserted STRUCTURALLY (WeekGrid.sensors.test.tsx); the raw gesture is a documented manual/Playwright check (see Limitations).
  - AC-4.4 / NFR-2 (touch assignment works on a narrow viewport without being swallowed by scroll) — the tap-to-assign fallback (tap recipe to select -> tap day/slot to place) is verified deterministically (WeeklyPlanner.assign.test.tsx); the PointerSensor touch activation delay (200ms) + tolerance (8px) that distinguishes a touch-drag from a page scroll is asserted structurally (WeekGrid.sensors.test.tsx). KeyboardSensor presence (a11y, S-6) is asserted structurally.

## Limitations / Notes

- Native HTML5 DnD is not used — dnd-kit only (F-2/S-6). Confirmed by the sensor wiring (PointerSensor + KeyboardSensor) in WeekGrid.tsx.
- LIVE-DRAG TESTING LIMITATION: a true pointer/touch drag gesture is not reliably exercisable in jsdom, and Playwright browser downloads are blocked by the sandbox's corporate TLS proxy (the same constraint recipe-library Bundle 6 documented). So the raw drag gesture (press-hold-move-drop over a day/slot, and the touch-vs-scroll disambiguation under real timing) is verified at the highest level the environment allows: the dnd-kit wiring is asserted STRUCTURALLY (draggable/droppable registered; PointerSensor configured WITH a touch activation delay + tolerance; KeyboardSensor present) and the assignment outcome is verified deterministically through the keyboard/tap path that shares the same assign() entry point. The end-to-end live-drag gesture is a documented manual/Playwright check.
  - Manual check: in edit mode, press-and-hold a recipe card and drag it onto a day's meal slot; confirm it is assigned and that a vertical swipe over the palette still scrolls the page (touch activation delay/tolerance).
- Touch activation delay (200ms) / tolerance (8px) are sensible defaults per AD-5; tune against a physical device if mobile users report drag/scroll friction.
- The recipe-only POST /plans body is validated against the shared planEntryInputSchema before the network call (S-1).

## Session Log

### 2026-06-01 — bundle complete
- Completed: STEP-17, STEP-18, STEP-19, STEP-20 (4/4).
- Added: @dnd-kit/core 6.3.1 (brings @dnd-kit/utilities + @dnd-kit/accessibility transitively).
- Created: apps/web/src/components/RecipePalette.tsx, apps/web/src/components/WeekGrid.tsx, plus tests (WeeklyPlanner.editmode.test.tsx, WeeklyPlanner.assign.test.tsx, WeekGrid.sensors.test.tsx).
- Modified: apps/web/src/views/WeeklyPlanner.tsx (edit-mode toggle + WeekGrid integration).
- Decisions: single shared assign() entry point for drag-drop / keyboard-drop / tap-to-assign so all three paths POST an identical recipe-only plan entry; PLANNER_SENSORS exported as a constant so the sensor config (touch delay+tolerance, keyboard) is testable without a raw gesture.
- Next: STEP-24 (downstream of this bundle).
