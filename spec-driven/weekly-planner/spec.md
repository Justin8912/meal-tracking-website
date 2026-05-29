# Specification: Weekly Planner

> Date: 2026-05-29
> Version: 1.0
> Location: spec-driven/weekly-planner/spec.md
> Tracking: N/A
> Source: Split from spec-driven/meal-tracking-mvp/spec.md (feature slice C of A/B/C)

> **Provenance Key**: [User] [Rally] [Inferred] [Default] [Codebase]

## Project Context

**Parent Project**: Greenfield repository (`meal-tracking-website`). Builds on `platform-foundation` (persistence/deployment) and `recipe-library` (recipes referenced by the planner). **[User]**

**Scope**: The "Weekly Planner" tab — a Monday–Sunday plan with per-day CRUD, recipe or freeform meals, a planned-meal detail view, week navigation/history, a drag-and-drop edit mode, and an optional weekly nutrition summary. **[User]**

## Overview

This specification defines the weekly meal planner. Users lay out meals for each day of the week, choosing either a saved recipe (from `recipe-library`) or a quick freeform meal, view a planned meal's details, navigate between weeks to review history or plan ahead, and use a drag-and-drop edit mode to assign recipes to days. An optional weekly nutrition summary aggregates the planned week's macros. **[User]**

### Current State
Greenfield. The reference prototype (`artifacts/food-tracker.jsx`) demonstrates a Mon–Sun planner with detail view, freeform meals, week navigation, and a (non-touch) drag-and-drop edit mode — used as UX reference only. Persistence comes from `platform-foundation`; recipes come from `recipe-library`. **[Codebase]**

## Goals

### Primary Goal
Let a household plan and track weekly meals, drawing on the recipe library, and review past weeks. **[User]**

### Secondary Goals
1. Make weekly planning fast and visual via drag-and-drop. **[User]**
2. Give a sense of how healthy the week's eating is via an aggregate nutrition summary. **[User]**

### Non-Goals (Explicitly Out of Scope)
- Recipe management and nutrition calculation (see `recipe-library`). **[User]**
- Persistence/deployment base (see `platform-foundation`). **[User]**

## Users

### Primary Users
| User Type | Description | Goals | Pain Points |
|-----------|-------------|-------|-------------|
| Household member | Anyone in the shared workspace; no individual login in MVP. **[User]** | Plan each day's meals, review past weeks, and judge weekly nutrition. **[User]** | No single place to lay out the week's meals and look back at history. **[Inferred]** |

## Functional Requirements

### FR-1: Weekly Planner

**Description**: A weekly view lists meals for Monday through Sunday. For any day, users can add, edit, or remove meals. A meal can be chosen from the recipe library, or entered as a freeform meal with just a title, description, and optional link. **[User]**

**User Story**: As a household member, I want to plan each day of the week with either a saved recipe or a quick freeform meal so that the whole week's eating is laid out.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-1.1 | Days shown | I open the Weekly Planner | The week loads | Days Monday through Sunday are displayed **[User]** |
| AC-1.2 | Add recipe to a day | A planned week | I add a meal to a day by selecting a recipe | The recipe is placed on that day **[User]** |
| AC-1.3 | Add freeform meal | A planned week | I add a meal by entering a title, description, and optional link instead of a recipe | The freeform meal is placed on that day **[User]** |
| AC-1.4 | Edit/remove a day's meal | A day with a planned meal | I edit or delete that meal | The change persists for that day **[User]** |
| AC-1.5 | Empty day state | A day with no planned meal | I view the week | The day shows a clear empty/add state **[Inferred]** |
| AC-1.6 | Save failure | A day's meal being added/edited/removed | The server-side save fails | An error indicates the change was not saved, and the plan is not silently lost **[Inferred]** |

**Priority**: Must Have
**Goal**: Primary
**Dependencies**: platform-foundation FR-1; recipe-library FR-1 (recipe references)

---

### FR-2: Planned-Meal Detail View

**Description**: Clicking a planned meal in the weekly view shows its details, including the recipe's (or freeform meal's) custom notes and optional link. **[User]**

**User Story**: As a household member, I want to see a planned meal's notes and link so that I have what I need to prepare it.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-2.1 | Open detail | A day with a planned meal | I click the meal | A detail view opens showing notes and the link (if present) **[User]** |
| AC-2.2 | Recipe nutrition in detail | A planned meal that is a saved recipe | I open its detail | Its nutrition breakdown is available from the detail view **[Inferred]** |

**Priority**: Must Have
**Goal**: Primary
**Dependencies**: FR-1; recipe-library FR-4 (nutrition)

---

### FR-3: Week Navigation & History

**Description**: Users can navigate between weeks — moving to previous weeks to review past plans and to upcoming weeks to plan ahead. Past weeks' plans are retained as history. **[User]**

**User Story**: As a household member, I want to move between weeks so that I can review what we ate previously and plan future weeks.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-3.1 | Navigate to previous week | The current week | I navigate backward | The previous week's saved plan is displayed **[User]** |
| AC-3.2 | Navigate to upcoming week | The current week | I navigate forward | The next week is displayed, ready to plan **[Inferred]** |
| AC-3.3 | History retained | A previous week that had meals planned | I navigate back to it later | The previously planned meals are still present **[User]** |
| AC-3.4 | History load failure | A request to load a past or upcoming week | The data fails to load | An error is shown rather than a blank/stale week, and I can retry **[Inferred]** |

**Priority**: Must Have
**Goal**: Secondary-1
**Dependencies**: FR-1

---

### FR-4: Drag-and-Drop Planner Edit Mode

**Description**: The planner has an edit mode that toggles a dedicated layout: the filterable recipe list on the left (with meal-type and custom-tag filters) and the week on the right. Users drag a recipe from the list onto the day they want to assign it to. **[User]**

**User Story**: As a household member, I want to drag recipes onto days so that planning the week is fast and visual.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-4.1 | Toggle edit mode | The Weekly Planner | I click the edit button | The edit layout appears with the recipe list on the left and the week on the right **[User]** |
| AC-4.2 | Filter in edit mode | The edit layout | I filter the recipe list by meal type or tag | The recipe list narrows accordingly **[User]** |
| AC-4.3 | Drag recipe to day | The edit layout with recipes listed | I drag a recipe onto a specific day | That recipe is assigned to that day **[User]** |
| AC-4.4 | Touch drag on mobile | The edit layout on a touch device | I drag a recipe with touch | The assignment works via a usable touch interaction (see NFR-2) **[User]** |

**Priority**: Must Have
**Goal**: Primary
**Dependencies**: FR-1; recipe-library FR-5 (recipe list + filters)

---

### FR-5: Weekly Nutrition Summary

**Description**: An aggregate view summarizes the macros of a planned week across its recipe-based meals, giving a sense of how healthy the week's eating is overall. Freeform meals (no nutrition data) are flagged as excluded. **[User]**

**User Story**: As a household member, I want a weekly nutrition summary so that I can judge how healthy our overall eating is, not just per recipe.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-5.1 | Aggregate the week | A week with planned recipe-based meals | I view the weekly summary | Aggregated macros (calories, protein, carbohydrates, fat, fiber) for the week are shown; vitamins/minerals are not aggregated at the weekly level for MVP **[User]** |
| AC-5.2 | Exclude unquantified meals | A week containing freeform meals with no nutrition data | I view the weekly summary | The summary makes clear which meals are not counted **[Inferred]** |

**Priority**: Nice to Have
**Goal**: Secondary-2
**Dependencies**: FR-1; recipe-library FR-4 (nutrition)

---

## Non-Functional Requirements

### NFR-1: Performance (Smoothness)
**Category**: Performance
**Description**: Week navigation and planner edits feel smooth; revisiting a week is fast. **[User]**
**Metric**: Perceived responsiveness of navigation and edits.
**Target**: Navigation between weeks feels immediate (cached where possible). **[Inferred]**
**Verification**: Manual interaction testing.

### NFR-2: Usability & Mobile Friendliness (incl. touch drag-and-drop)
**Category**: Usability
**Description**: Responsive on phones and desktops; the drag-and-drop edit mode supports a usable touch interaction; WCAG 2.1 AA basics. **[User]**
**Metric**: Core planner flows completable on a phone; touch drag works.
**Target**: Planning, navigation, detail view, and drag-and-drop assignment are completable on a phone and desktop. **[User]**
**Verification**: Manual + e2e testing across mobile and desktop, including touch drag emulation.

---

## Scope

### In Scope
- Weekly planner (Mon–Sun) with per-day CRUD; recipe or freeform meals. **[User]**
- Planned-meal detail view; week navigation/history. **[User]**
- Drag-and-drop edit mode with filterable recipe list. **[User]**
- Optional weekly macro summary. **[User]**

### Out of Scope
- Recipe management and nutrition calculation (`recipe-library`). **[User]**
- Persistence/deployment base (`platform-foundation`). **[User]**
- Weekly vitamin/mineral aggregation (macros only for MVP). **[User]**

### Constraints
- A week is identified by its Monday date (not an ISO week string), for reliable history/navigation. **[User]**
- The planner draws recipes and filters from `recipe-library`. **[User]**

### Assumptions
- The planner grid includes all four meal slots (breakfast/lunch/dinner/snack). **[User]**
- Deleting a referenced recipe leaves the plan entry as a tombstone (ON DELETE SET NULL). **[User]**

### Risks
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Drag-and-drop broken on touch | High | Medium | Use a pointer/touch-capable DnD library; e2e touch test; tap-to-assign fallback (AC-4.4, NFR-2) |
| Week-boundary bugs in history navigation | Medium | Medium | Identify weeks by Monday date; range-query by date |

## Dependencies

### External Systems
- None directly (persistence via `platform-foundation`). **[User]**

### Internal Dependencies
- `platform-foundation` (persistence). **[User]**
- `recipe-library` (recipes, nutrition, filters referenced by the planner). **[User]**

## Open Questions

_Resolved during the originating spec: weekly summary aggregates macros only._

## Agent Decisions

| # | Decision | Context | Rationale | Affects |
|---|----------|---------|-----------|---------|
| 1 | Carved planning features into one spec | User split the MVP into three specs | These FRs form the cohesive "Weekly Planner" tab and depend on recipes from the library | FR-1..FR-5 |
