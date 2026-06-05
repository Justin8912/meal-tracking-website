# Specification: Meal Tracking Website (MVP)

> Date: 2026-05-29
> Version: 1.1
> Location: spec-driven/meal-tracking-mvp/spec.md
> Tracking: N/A
> Source: Interactive elicitation from artifacts/epic.md (with artifacts/food-tracker.jsx as UX reference)

> **Provenance Key**: Content sources are marked inline:
> - **[User]** — Directly stated by the user
> - **[Rally]** — Imported from Rally data
> - **[Inferred]** — Synthesized by the agent from available context
> - **[Default]** — Standard default applied
> - **[Codebase]** — Derived from codebase analysis

## Project Context

**Parent Project**: Greenfield repository (`meal-tracking-website`). No `CLAUDE.md` or build tooling exists yet. **[Codebase]**

**Scope**: This specification defines the MVP for a household meal-tracking web application. It is specified independently; the existing prototype is a UX reference only. **[User]**

## Overview

The Meal Tracking Website is a one-stop-shop web application for a household's food and nutrition. It combines a **recipe library**, a **weekly meal planner** with history, and **automatic nutrition breakdowns** (macros plus vitamins/minerals) computed from each recipe's ingredients. The aim is to make it easy to capture recipes, plan the week's meals, look back at previous weeks, and understand how healthy the household's eating habits are. **[User]**

Ingredient nutrition data is sourced primarily from an **external nutrition API**, with a fallback path for **custom user-entered ingredients** (e.g. store-bought items not in the API). User data is stored **server-side and synced across devices** so any household member sees the same recipes and plans from any device. The MVP treats the household as a single shared workspace with **no individual login**, but the data model and architecture must be built so that **per-user authentication can be added later** without major rework. **[User]**

The interface follows a two-tab structure — Meal Library and Weekly Planner — and must be **mobile-friendly** as well as usable on desktop. **[User]**

### Current State

Greenfield. The repository contains only a README and an `artifacts/` folder. A single-file React prototype (`artifacts/food-tracker.jsx`, ~774 lines) demonstrates the intended UX: a tabbed Meal Library + Weekly Planner, recipe CRUD, a hardcoded ~30-item ingredient database, custom-ingredient entry, tags, search, meal types/servings, a Mon–Sun planner with detail view and freeform meals, week navigation, and a drag-and-drop edit mode. The prototype persists via a browser-local async storage API and has no build tooling, backend, external API integration, or authentication. It is used here as a **UX reference only** — the MVP is specified independently and may diverge in implementation. **[Codebase]**

## Goals

### Primary Goal
Enable a household to manage recipes and plan/track weekly meals in one application, with automatic nutrition breakdowns that reveal how healthy their eating habits are. **[User]**

### Secondary Goals
1. Automatically calculate macro and vitamin/mineral content for recipes from their ingredients. **[User]**
2. Let the household review previous weeks' meal plans (history). **[User]**
3. Provide access to the same data across devices via cloud sync. **[User]**

### Non-Goals (Explicitly Out of Scope)
- Individual user authentication / accounts in the MVP — deferred, though the architecture must accommodate adding it later. **[User]**
- Native mobile applications (the web app must be mobile-friendly, but no iOS/Android apps). **[Inferred]**
- Grocery / shopping list generation. **[Inferred]**
- Barcode scanning for ingredient entry. **[Inferred]**

## Users

### Primary Users
| User Type | Description | Goals | Pain Points |
|-----------|-------------|-------|-------------|
| Household member | Anyone in the household using the shared workspace; no individual login in MVP. **[User]** | Capture recipes, plan the week's meals, review past weeks, and understand the household's nutrition. **[User]** | No single place to keep recipes, plan meals, and see nutrition; manual nutrition math is tedious and error-prone. **[Inferred]** |

### Secondary Users
| User Type | Description | Goals | Pain Points |
|-----------|-------------|-------|-------------|
| Authenticated individual (future) | A future per-user account once authentication is added. **[User]** | Keep private recipes/plans separate from other household members. **[Inferred]** | Not addressed in MVP; data model must be ready to scope ownership per user. **[User]** |

## Functional Requirements

### FR-1: Recipe CRUD

**Description**: Users can create, view, edit, and delete recipes. A recipe captures a name, meal type, number of servings, a list of ingredients (each with quantity and unit), free-text notes, an optional source link, and custom tags. **[User]**

**User Story**: As a household member, I want to create and edit recipes with their ingredients and details so that I have a reusable library to plan meals from.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-1.1 | Create recipe | I am in the Meal Library | I add a new recipe with a name, meal type, servings, and at least one ingredient | The recipe is saved and appears in the library **[User]** |
| AC-1.2 | Edit recipe | An existing recipe | I open it and change any field (name, ingredients, notes, link, tags, servings, meal type) | The changes are persisted and reflected in the library **[User]** |
| AC-1.3 | Delete recipe | An existing recipe | I delete it and confirm | The recipe is removed from the library and no longer appears in future searches **[User]** |
| AC-1.4 | Optional fields | A recipe being created | I leave notes and link empty | The recipe still saves successfully (notes and link are optional) **[Inferred]** |
| AC-1.5 | Validation failure | A recipe being created | I attempt to save it with no name or no ingredients | An error message is displayed, the recipe is not saved, and my input is preserved **[Inferred]** |
| AC-1.6 | Save failure | A recipe create/edit/delete | The server-side save fails (see FR-11) | An error message is displayed indicating the change was not saved, and the prior state is not silently lost **[Inferred]** |

**Priority**: Must Have

**Goal**: Primary

**Dependencies**: None

---

### FR-2: Ingredient Lookup via External Nutrition API

**Description**: When adding ingredients to a recipe, users can search the USDA FoodData Central API and select a food item; the system retrieves its nutrition data (macros and vitamins/minerals) for use in calculations. **[User]**

**User Story**: As a household member, I want to search a nutrition database for ingredients so that accurate nutrition data is attached without manual entry.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-2.1 | Search returns matches | I am adding an ingredient | I type a food name (e.g. "chicken breast") | Matching foods from USDA FoodData Central are shown to choose from **[User]** |
| AC-2.2 | Selection attaches nutrition | A search result list | I select a food and enter a quantity and unit | The ingredient is added to the recipe with its nutrition data attached **[User]** |
| AC-2.3 | API failure fallback | The nutrition API is slow or unavailable | I attempt an ingredient search | A clear error is shown and I can still add a custom ingredient (see FR-3) instead of being blocked **[User]** |
| AC-2.4 | API key not exposed | Any ingredient search | The request is made | The external API key is used server-side and never sent to or visible in the browser **[User]** |

**Priority**: Must Have

**Goal**: Secondary-1

**Dependencies**: None

---

### FR-3: Custom Ingredients

**Description**: Users can manually create a custom ingredient by entering its nutrition facts (macros and, optionally, vitamins/minerals) for items not available in the external API — for example, a specific store-bought tortilla. Custom ingredients can be added to recipes like any API-sourced ingredient. **[User]**

**User Story**: As a household member, I want to enter nutrition facts for a custom ingredient so that I can accurately track foods the nutrition API doesn't have.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-3.1 | Create custom ingredient | I am adding ingredients to a recipe | I choose "custom" and enter a name and nutrition facts | The custom ingredient is created and added to the recipe **[User]** |
| AC-3.2 | Custom contributes to calc | A recipe containing a custom ingredient | Nutrition is calculated | The custom ingredient's values are included in the recipe's totals (see FR-4) **[Inferred]** |
| AC-3.3 | Reuse a custom ingredient | A custom ingredient created previously | I add ingredients to another recipe | I can find and reuse the previously created custom ingredient **[Inferred]** |

**Priority**: Must Have

**Goal**: Secondary-1

**Dependencies**: None

---

### FR-4: Automatic Nutrition Calculation

**Description**: The system automatically calculates a recipe's nutrition — macros (calories, protein, carbs, fat, fiber) and vitamins/minerals — by summing its ingredients, scaled by each ingredient's quantity and unit, and presents both per-recipe and per-serving values based on the recipe's servings. **[User]**

**User Story**: As a household member, I want a recipe's nutrition computed automatically from its ingredients so that I don't have to do the math myself.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-4.1 | Macro totals | A recipe with ingredients having quantities and units | I view the recipe | Macro totals — calories, protein, carbohydrates, fat, and fiber — are shown, scaled correctly by quantity/unit **[User]** |
| AC-4.2 | Vitamins/minerals | A recipe with ingredients carrying vitamin/mineral data | I view the recipe | Aggregated vitamin/mineral content is shown, covering at least the vitamins/minerals returned by the data source for those ingredients **[User]** |
| AC-4.3 | Per-serving values | A recipe with a servings count greater than 1 | I view the recipe | Both total and per-serving nutrition are shown, divided by servings **[Inferred]** |
| AC-4.4 | Recalculation on edit | An existing recipe | I change an ingredient, its quantity/unit, or the servings count | The nutrition breakdown updates to reflect the change **[Inferred]** |
| AC-4.5 | Unit conversion | An ingredient entered in a non-gram unit (e.g. cup, tbsp, qty) | Nutrition is calculated | The quantity is converted consistently so totals are accurate **[Inferred]** |

**Priority**: Must Have

**Goal**: Secondary-1

**Dependencies**: FR-2, FR-3

---

### FR-5: Recipe Tagging & Filtering

**Description**: Users can apply custom tags to recipes and filter the Meal Library by tag and by meal type. **[User]**

**User Story**: As a household member, I want to tag and filter recipes so that I can quickly find the ones I want.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-5.1 | Add custom tag | A recipe | I add a custom tag to it | The tag is saved on the recipe and available as a filter **[User]** |
| AC-5.2 | Filter by tag | A library with tagged recipes | I select a tag filter | Only recipes carrying that tag are shown **[User]** |
| AC-5.3 | Filter by meal type | A library with recipes of various meal types | I filter by a meal type (e.g. dinner) | Only recipes of that meal type are shown **[User]** |

**Priority**: Must Have

**Goal**: Primary

**Dependencies**: FR-1

---

### FR-6: Recipe Search

**Description**: Users can search the Meal Library by text to locate recipes by name. **[User]**

**User Story**: As a household member, I want to search my recipes so that I can find a specific one without scrolling.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-6.1 | Search by name | A library of recipes | I type text into the search box | Recipes whose names match the text are shown **[User]** |
| AC-6.2 | No matches | A search with no matching recipes | The search completes | A clear empty state is shown rather than a blank screen **[Inferred]** |

**Priority**: Must Have

**Goal**: Primary

**Dependencies**: FR-1

---

### FR-7: Weekly Planner

**Description**: A weekly view lists meals for Monday through Sunday. For any day, users can add, edit, or remove meals. A meal can be chosen from the recipe library, or entered as a freeform meal with just a title, description, and optional link when no recipe applies. **[User]**

**User Story**: As a household member, I want to plan each day of the week with either a saved recipe or a quick freeform meal so that the whole week's eating is laid out.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-7.1 | Days shown | I open the Weekly Planner | The week loads | Days Monday through Sunday are displayed **[User]** |
| AC-7.2 | Add recipe to a day | A planned week | I add a meal to a day by selecting a recipe | The recipe is placed on that day **[User]** |
| AC-7.3 | Add freeform meal | A planned week | I add a meal to a day by entering a title, description, and optional link instead of a recipe | The freeform meal is placed on that day **[User]** |
| AC-7.4 | Edit/remove a day's meal | A day with a planned meal | I edit or delete that meal | The change persists for that day **[User]** |
| AC-7.5 | Empty day state | A day with no planned meal | I view the week | The day shows a clear empty/add state **[Inferred]** |
| AC-7.6 | Save failure | A day's meal being added, edited, or removed | The server-side save fails (see FR-11) | An error message is displayed indicating the change was not saved, and the plan is not silently lost **[Inferred]** |

**Priority**: Must Have

**Goal**: Primary

**Dependencies**: FR-1

---

### FR-8: Planned-Meal Detail View

**Description**: Clicking a planned meal in the weekly view shows its details, including the recipe's (or freeform meal's) custom notes and optional link. **[User]**

**User Story**: As a household member, I want to see a planned meal's notes and link so that I have what I need to prepare it.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-8.1 | Open detail | A day with a planned meal | I click the meal | A detail view opens showing notes and the link (if present) **[User]** |
| AC-8.2 | Recipe nutrition in detail | A planned meal that is a saved recipe | I open its detail | Its nutrition breakdown is available from the detail view **[Inferred]** |

**Priority**: Must Have

**Goal**: Primary

**Dependencies**: FR-7

---

### FR-9: Week Navigation & History

**Description**: Users can navigate between weeks — moving to previous weeks to review past plans and to upcoming weeks to plan ahead. Past weeks' plans are retained as history. **[User]**

**User Story**: As a household member, I want to move between weeks so that I can review what we ate previously and plan future weeks.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-9.1 | Navigate to previous week | The current week in the planner | I navigate backward | The previous week's saved plan is displayed **[User]** |
| AC-9.2 | Navigate to upcoming week | The current week in the planner | I navigate forward | The next week is displayed, ready to plan **[Inferred]** |
| AC-9.3 | History retained | A previous week that had meals planned | I navigate back to it later | The previously planned meals are still present **[User]** |
| AC-9.4 | History load failure | A request to load a past or upcoming week | The data fails to load from the server | An error message is displayed rather than a blank or stale week, and I can retry **[Inferred]** |

**Priority**: Must Have

**Goal**: Secondary-2

**Dependencies**: FR-7

---

### FR-10: Drag-and-Drop Planner Edit Mode

**Description**: The planner has an edit mode that toggles a dedicated layout: the filterable recipe list on the left (with meal-type and custom-tag filters) and the week on the right. Users drag a recipe from the list onto the day they want to assign it to. **[User]**

**User Story**: As a household member, I want to drag recipes onto days so that planning the week is fast and visual.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-10.1 | Toggle edit mode | The Weekly Planner | I click the edit button | The edit layout appears with the recipe list on the left and the week on the right **[User]** |
| AC-10.2 | Filter in edit mode | The edit layout | I filter the recipe list by meal type or tag | The recipe list narrows accordingly **[User]** |
| AC-10.3 | Drag recipe to day | The edit layout with recipes listed | I drag a recipe onto a specific day | That recipe is assigned to that day **[User]** |
| AC-10.4 | Touch drag on mobile | The edit layout on a touch device | I drag a recipe with touch | The assignment works via a usable touch interaction (see NFR-2) **[User]** |

**Priority**: Must Have

**Goal**: Primary

**Dependencies**: FR-7

---

### FR-11: Cloud Persistence & Cross-Device Sync

**Description**: All recipes, custom ingredients, tags, and weekly plans are stored server-side for the shared household workspace and synced across devices, so any device shows the same up-to-date data. **[User]**

**User Story**: As a household member, I want our data saved in the cloud so that everyone sees the same recipes and plans on any device.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-11.1 | Persist on change | Any create/edit/delete of a recipe, ingredient, tag, or planned meal | The action completes | The change is saved server-side **[User]** |
| AC-11.2 | Cross-device visibility | Data saved on one device | I open the app on another device | I see the same recipes and weekly plans **[User]** |
| AC-11.3 | Reload persistence | A populated workspace | I reload or revisit the app later | All previously saved data is present **[User]** |
| AC-11.4 | Ownership-ready model | The stored data | Accounts are added in the future | The data model can scope records to an owner/workspace without restructuring existing data (see NFR-4) **[User]** |
| AC-11.5 | Persistence failure surfaced | A create/edit/delete action | The server-side save fails or times out | The user is notified the change was not persisted (rather than the app appearing to have saved it) **[Inferred]** |

**Priority**: Must Have

**Goal**: Secondary-3

**Dependencies**: FR-1, FR-7

---

### FR-12: Weekly Nutrition Summary

**Description**: An aggregate view summarizes the nutrition of a planned week across its meals, giving the household a sense of how healthy the week's eating is overall. **[User]**

**User Story**: As a household member, I want a weekly nutrition summary so that I can judge how healthy our overall eating is, not just per recipe.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-12.1 | Aggregate the week | A week with planned recipe-based meals | I view the weekly summary | Aggregated macros (calories, protein, carbohydrates, fat, fiber) for the week are shown; vitamins/minerals are not aggregated at the weekly level for MVP **[User]** |
| AC-12.2 | Exclude unquantified meals | A week containing freeform meals with no nutrition data | I view the weekly summary | The summary makes clear which meals are not counted (freeform meals lack nutrition data) **[Inferred]** |

**Priority**: Nice to Have

**Goal**: Primary

**Dependencies**: FR-4, FR-7

---

## Non-Functional Requirements

### NFR-1: Performance (Smoothness, not strict latency)

**Category**: Performance

**Description**: The UI should feel smooth and responsive for navigation and editing. Nutrition calculations prioritize accuracy over speed — there is no hard latency budget on a calculation; it may take as long as needed to be correct. **[User]**

**Metric**: Perceived smoothness of UI interactions; absence of a forced latency cap on nutrition calculation.

**Target**: Common UI interactions (tab switch, opening a recipe, filtering) feel immediate (no perceptible jank). Nutrition calculation has no maximum-time requirement; correctness takes precedence. **[User]**

**Verification**: Manual interaction testing on desktop and a mobile device; confirm calculations complete and values are correct regardless of duration.

---

### NFR-2: Usability & Mobile Friendliness

**Category**: Usability

**Description**: The application is responsive and usable on both phones and desktops. The planner's drag-and-drop edit mode supports a usable touch interaction on mobile. Basic accessibility (WCAG 2.1 AA fundamentals) is targeted. **[User]**

**Metric**: Layout adapts across viewport sizes; core flows completable on a phone; touch drag works.

**Target**: All MVP flows (recipe CRUD, search/filter, weekly planning, drag-and-drop assignment, viewing nutrition) are completable on a typical phone screen and on desktop. **[User]**

**Verification**: Manual testing across mobile and desktop viewports for each FR flow.

---

### NFR-3: Nutrition Accuracy

**Category**: Correctness

**Description**: Nutrition breakdowns must accurately reflect ingredient quantities, unit conversions, and serving counts, using data from the external API or custom-entered values. **[User]**

**Metric**: Computed totals match the sum of ingredient contributions after unit/serving scaling.

**Target**: Calculated macros and vitamins/minerals match expected values for known test recipes within rounding tolerance. **[Inferred]**

**Verification**: Unit tests over representative recipes with mixed units and serving counts, comparing computed totals to hand-verified expected values.

---

### NFR-4: Security & Authentication-Readiness

**Category**: Security

**Description**: External nutrition-API credentials are kept server-side and never exposed to the client. The data model carries an owner/workspace scope so per-user authentication can be added later without restructuring existing data. **[User]**

**Metric**: No API keys in client bundles or network responses; records are associable with an owner/workspace identifier.

**Target**: Zero secrets in client-delivered code; data schema includes (or can accommodate) an owner/workspace field from day one. **[User]**

**Verification**: Inspect client bundle and network traffic for secrets; review schema for ownership scoping.

---

### NFR-5: Cost

**Category**: Cost

**Description**: Operating costs stay within the free tier of USDA FoodData Central and low-cost hosting. API responses are cached to limit call volume. **[User]**

**Metric**: USDA FoodData Central API call count against its free-tier rate limit; hosting/tier usage.

**Target**: Stay within the USDA FoodData Central free-tier rate limit (a free API key is required; default is on the order of 1,000 requests/hour per key — confirm current limit at signup); cache ingredient lookups to avoid redundant calls. **[Inferred]**

**Verification**: Review API usage/call counts during testing; confirm cache hits for repeated lookups.

---

### NFR-6: Operability

**Category**: Operability

**Description**: The application emits basic structured error logging and supports a simple, repeatable deployment. **[Inferred]**

**Metric**: Errors are logged with enough context to diagnose; deploy is a documented, repeatable process.

**Target**: Server-side errors (including external API failures) are logged; a documented deploy path exists. **[Inferred]**

**Verification**: Trigger representative error conditions and confirm log output; perform a deploy following the documented steps.

---

### NFR-7: Reliability (External API Degradation)

**Category**: Reliability

**Description**: The app degrades gracefully when the external nutrition API is slow or unavailable: it surfaces a clear error, uses cached lookups where possible, and always allows custom-ingredient entry as a fallback so the user is never fully blocked. **[User]**

**Metric**: Behavior under API failure/timeout.

**Target**: On API failure, the user sees a clear message and can proceed via cached data or custom ingredient entry; no unhandled errors. **[User]**

**Verification**: Simulate API timeout/outage and confirm fallback paths work.

---

## Scope

### In Scope
- Two-tab web app: Meal Library and Weekly Planner. **[User]**
- Recipe CRUD with ingredients (quantity + unit), meal type, servings, notes, optional link, and custom tags. **[User]**
- Ingredient lookup via an external nutrition API, plus custom user-entered ingredients. **[User]**
- Automatic per-recipe and per-serving nutrition calculation (macros + vitamins/minerals). **[User]**
- Tagging, tag/meal-type filtering, and text search of recipes. **[User]**
- Weekly planner (Mon–Sun) with per-day CRUD, recipe or freeform meals, detail view, week navigation/history, and a drag-and-drop edit mode. **[User]**
- Server-side cloud persistence with cross-device sync for the shared household workspace. **[User]**
- Mobile-friendly, responsive UI. **[User]**

### Out of Scope
- Individual user authentication/accounts (deferred; architecture must remain ready for it). **[User]**
- Native mobile apps. **[Inferred]**
- Grocery/shopping list generation. **[Inferred]**
- Barcode scanning. **[Inferred]**

### Constraints
- USDA FoodData Central is the primary source of ingredient nutrition data. **[User]**
- The MVP operates as a single global shared workspace — all users see and edit the same data. **[User]**
- Data must persist server-side with cross-device sync. **[User]**
- The architecture and data model must allow adding per-user authentication later without major rework (records carry an owner/workspace scope). **[User]**
- External API keys must never be exposed to the client. **[User]**

### Assumptions
- The MVP operates as a single global shared workspace; all members see and edit the same data, with no per-user separation until authentication is added. **[User]**
- USDA FoodData Central provides adequate ingredient coverage and an acceptable free-tier API quota for the household's usage. **[User]**
- The existing prototype (`artifacts/food-tracker.jsx`) represents the desired UX direction but does not constrain implementation. **[User]**

### Risks
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| External nutrition API coverage/accuracy is incomplete for some foods | Medium | Medium | Custom-ingredient entry (FR-3) fills gaps; cache and validate returned data |
| External nutrition API availability, rate limits, or pricing changes | Medium | Medium | Cache lookups (NFR-5), degrade gracefully and allow custom entry (NFR-7) |
| Unit conversion errors produce inaccurate nutrition totals | High | Medium | Explicit unit-conversion tests against hand-verified recipes (NFR-3) |
| Shared no-auth workspace makes future auth retrofit costly if deferred too long | Medium | Low | Owner/workspace scoping in the data model from day one (NFR-4, AC-11.4) |
| Drag-and-drop is awkward on touch devices | Medium | Medium | Treat mobile touch drag as an explicit acceptance criterion (AC-10.4) and test on a device |

## Dependencies

### External Systems
- USDA FoodData Central API (ingredient nutrition data — macros and vitamins/minerals). **[User]**
- Server-side data store / backend for cloud persistence and sync. **[User]**

### Internal Dependencies
- None (greenfield, single project). **[Codebase]**

### Data Dependencies
- Ingredient nutrition records (from the external API and from user-entered custom ingredients). **[User]**

## Open Questions

> Questions that need stakeholder input before implementation

_All open questions from elicitation have been resolved (see Resolved Questions below)._

## Resolved Questions

| Question | Resolution |
|----------|------------|
| Which external nutrition API will be used? | USDA FoodData Central. **[User]** |
| How is the shared workspace identified before authentication exists? | A single global shared workspace for MVP (no per-user separation). **[User]** |
| Does the weekly nutrition summary (FR-12) aggregate vitamins/minerals or macros only? | Macros only for MVP. **[User]** |

## Agent Decisions

> Decisions made by the agent during elicitation. Review these — they represent assumptions that may need validation.

| # | Decision | Context | Rationale | Affects |
|---|----------|---------|-----------|---------|
| 1 | Split the epic's broad in-scope list into 12 discrete FRs | The epic described capabilities as prose bullets, not numbered requirements | Discrete FRs with acceptance criteria are needed for planning and verification | All FRs |
| 2 | Added NFR-3 (Nutrition Accuracy) as a distinct correctness NFR | User emphasized accuracy over latency when adjusting NFR-1 | Accuracy is a measurable quality attribute worth its own verifiable NFR | NFR-1, NFR-3, FR-4 |
| 3 | Treated authentication as a Non-Goal but added an auth-readiness constraint and AC-11.4/NFR-4 | User asked for shared-household-now, account-ready-later | Keeps MVP scope small while preventing a costly future retrofit | FR-11, NFR-4, Non-Goals, Constraints |
| 4 | Classified native apps, grocery lists, and barcode scanning as Non-Goals | These are common adjacent features the epic did not request | Bounds MVP scope explicitly to avoid scope creep | Non-Goals |
