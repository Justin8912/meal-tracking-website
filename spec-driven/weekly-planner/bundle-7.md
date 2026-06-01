# Bundle 7: Integration & Verification

> Slice 3: Integration (Stage: integration)
> Stage: integration | Parallel: no | Files: (verification — e2e/test specs) apps/web/e2e/*, apps/api/test/*

**Bundle Verify**: The weekly planner works end-to-end — plan a week, drag/tap recipes on touch, navigate history, see the weekly macro summary, all usable on a phone.
- **Level**: e2e
- **Given**: the full stack (platform + recipe-library + weekly-planner) running via docker compose
- **Action**: run the e2e suite (plan-a-week, touch drag-and-drop, week-history) plus the weekly-summary and 390px responsive checks
- **Outcome**: all flows pass; touch assignment works; history resolves by Monday DATE; the macro summary is correct with exclusions flagged; the UI is usable at a phone viewport

> **Context**
>
> **Applicable ACs**
> - **AC-4.4**: Given: the edit layout on a touch device / When: I drag a recipe with touch / Then: the assignment works via a usable touch interaction
> - **AC-3.1 / AC-3.3**: week navigation backward and history retention
> - **AC-5.1 / AC-5.2**: weekly macro summary with exclusions flagged
>
> **Architecture Decisions**
> - **AD-2: Week identified by the Monday DATE** — history verified across navigation (incl. year boundary).
> - **AD-5: dnd-kit with touch activation + tap fallback** — touch assignment verified under emulation.
> - **AD-6: macros-only weekly summary** — verified end-to-end with exclusions.
>
> **Risks**
> - Porting prototype DnD would ship a planner broken on touch (Impact: high | Mitigation: touch-emulation e2e on the dnd-kit + tap path)
> - Week-boundary bugs in history navigation (Impact: medium | Mitigation: year-boundary week in the history e2e)
>
> **NFR**
> - NFR-1: revisiting a week is instant (cached) — checked in the plan-a-week / history flows
> - NFR-2: core flows completable on a phone; touch drag works — checked at 390px + touch emulation

#### STEP-23: End-to-end plan-a-week flow
MANUAL -> End-to-end verification of planning a full week (recipe + freeform)

> **Intent**: Bundles verify pieces; this proves the wired whole. A user planning a week with a mix of recipe-based and freeform meals across days/slots must see them persist and reload through the real stack (web->api->postgres), catching integration gaps (week_start_date normalization, week-keyed query, XOR enforcement) that component/integration tests miss individually.

- With the full stack up, plan a week: add recipe meals and freeform meals across several days/slots
- Reload the planner and confirm every meal is present on its day/slot
- Confirm a both-recipe-and-freeform attempt is rejected with an error

**Verify**:
- Level: e2e | Given: the full stack running | Action: plan a week (recipe + freeform meals), reload | Outcome: all meals persist on the correct day/slot and reload unchanged; the XOR violation is rejected (AC-1.2/AC-1.3/AC-1.4)

> Depends on: STEP-10, STEP-16 | Enables: STEP-24 | Parallel with: —

#### STEP-24: Drag-and-drop touch end-to-end
MANUAL -> Verify touch drag-and-drop assignment under emulation (AC-4.4, NFR-2)

> **Intent**: AC-4.4 is the highest-risk requirement (the prototype's DnD is broken on touch). Under real touch emulation, dragging a recipe from the palette onto a day/slot — and the tap-to-assign fallback — must assign the recipe without the gesture being swallowed by page scroll. This is the touch guarantee (NFR-2) that distinguishes a usable mobile planner from one that only works with a mouse.

- With the full stack up and touch emulation, enter edit mode and drag a recipe onto a day/slot
- Confirm the assignment succeeds and the touch-drag is not consumed by page scroll (activation delay/tolerance)
- Confirm the tap-to-assign fallback (tap recipe, tap day/slot) also assigns

**Verify**:
- Level: e2e | Given: touch emulation, edit mode | Action: touch-drag a recipe to a day, then use tap-to-assign | Outcome: both assign the recipe to the day/slot; scrolling is not mistaken for a drag (AC-4.4, NFR-2)

> Depends on: STEP-20, STEP-23 | Enables: — | Parallel with: STEP-25

#### STEP-25: Week-history end-to-end
MANUAL -> Verify week navigation and history across a year boundary (AC-3.1, AC-3.3)

> **Intent**: The week-boundary bug (F-11) is most likely at a year edge. This drives navigation backward/forward across a year boundary and revisiting a past week through the real stack, asserting each week resolves by its Monday DATE and a past week's meals are intact — the history guarantee end-to-end (not just unit-level date math).

- With the full stack up, plan meals in a week spanning a year boundary (e.g. late December)
- Navigate forward into January and back; navigate to the prior week
- Confirm each week resolves correctly and the year-boundary week's meals are intact on return

**Verify**:
- Level: e2e | Given: meals planned in a year-boundary week | Action: navigate forward/back across the boundary and return | Outcome: each week resolves by its Monday DATE; the past week's meals are retained (AC-3.1/AC-3.3)

> Depends on: STEP-14, STEP-23 | Enables: — | Parallel with: STEP-24

#### STEP-26: Weekly-summary check
MANUAL -> Verify the weekly macro summary end-to-end (AC-5.1, AC-5.2)

> **Intent**: Confirm the weekly summary, end-to-end, aggregates macros only from the week's recipe-based meals (computed via the shared engine on unrounded values) and clearly flags freeform meals and recipe tombstones as excluded — so the user sees an accurate macro total and knows what is not counted, with no micronutrient aggregation (AC-5.1) and no silent zero-counting of freeform meals (AC-5.2).

- With the full stack up and a week containing recipe meals + a freeform meal, view the weekly summary
- Confirm the macro totals match the expected sum and no vitamins/minerals are aggregated
- Confirm the freeform meal is flagged as excluded

**Verify**:
- Level: e2e | Given: a planned week with recipe + freeform meals | Action: view the weekly summary | Outcome: macro totals are correct; micronutrients not aggregated (AC-5.1); the freeform meal is flagged excluded (AC-5.2)

> Depends on: STEP-22, STEP-23 | Enables: — | Parallel with: STEP-27

#### STEP-27: Mobile-responsive verification
MANUAL -> Verify the Weekly Planner is usable on a phone viewport (NFR-2)

> **Intent**: NFR-2 requires the planner's core flows (view the week, add/edit/remove a meal, open a detail, navigate weeks, and the drag-and-drop edit mode) to be usable on a phone, not just desktop. This checks them at a phone viewport so layout breakage (the two-panel edit mode not collapsing, unreachable controls, overflow) is caught before release.

- Run the e2e suite (or a responsive check) at a phone viewport (e.g. 390px) over the core planner flows
- Confirm the edit mode collapses to a single column with the palette drawer and controls are reachable
- Confirm WCAG 2.1 AA basics (labels, focus order, keyboard DnD path) on the planner

**Verify**:
- Level: e2e | Given: a 390px viewport | Action: view the week, add/edit a meal, open a detail, navigate weeks, enter edit mode and assign a recipe | Outcome: all flows are completable; the edit layout collapses to a drawer; no overflow/clipping; controls are labeled and focusable (NFR-2)

> Depends on: STEP-20, STEP-12 | Enables: — | Parallel with: STEP-26
