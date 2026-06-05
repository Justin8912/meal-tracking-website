# Specification: Recipe Library & Nutrition

> Date: 2026-05-29
> Version: 1.0
> Location: spec-driven/recipe-library/spec.md
> Tracking: N/A
> Source: Split from spec-driven/meal-tracking-mvp/spec.md (feature slice B of A/B/C)

> **Provenance Key**: [User] [Rally] [Inferred] [Default] [Codebase]

## Project Context

**Parent Project**: Greenfield repository (`meal-tracking-website`). Builds on the `platform-foundation` spec (persistence, workspace, deployment). **[User]**

**Scope**: The "Meal Library" tab — recipe CRUD, ingredient lookup via USDA FoodData Central, custom ingredients, automatic nutrition calculation, tagging/filtering, and search. **[User]**

## Overview

This specification defines the recipe library and nutrition features of the meal-tracking app. Users manage recipes, attach ingredients sourced from the USDA FoodData Central API or entered as custom items, and see automatically calculated nutrition breakdowns (macros plus vitamins/minerals). Recipes can be tagged, filtered, and searched. Nutrition data is sourced from an external API and accuracy is prioritized over speed. **[User]**

### Current State
Greenfield. A reference-only React prototype (`artifacts/food-tracker.jsx`) demonstrates recipe CRUD, a hardcoded ingredient list, custom ingredients, tags, search, meal types, servings, and client-side nutrition math — used as UX reference only. Persistence and the deployment base are provided by `platform-foundation`. **[Codebase]**

## Goals

### Primary Goal
Let a household capture and manage recipes with accurate, automatically calculated nutrition. **[User]**

### Secondary Goals
1. Auto-calculate macro and vitamin/mineral content from ingredients. **[User]**
2. Make recipes easy to find via tags, meal-type filters, and search. **[User]**

### Non-Goals (Explicitly Out of Scope)
- Weekly meal planning (see `weekly-planner`). **[User]**
- Accurate volume conversions requiring an external density source beyond per-ingredient gram-equivalents. **[Inferred]**
- Barcode scanning; grocery lists. **[Inferred]**

## Users

### Primary Users
| User Type | Description | Goals | Pain Points |
|-----------|-------------|-------|-------------|
| Household member | Anyone in the shared workspace; no individual login in MVP. **[User]** | Capture recipes and understand their nutrition without manual math. **[User]** | Manual nutrition calculation is tedious and error-prone; recipes scattered across sources. **[Inferred]** |

## Functional Requirements

### FR-1: Recipe CRUD

**Description**: Users can create, view, edit, and delete recipes. A recipe captures a name, meal type, number of servings, a list of ingredients (each with quantity and unit), free-text notes, an optional source link, and custom tags. **[User]**

**User Story**: As a household member, I want to create and edit recipes with their ingredients and details so that I have a reusable library to plan meals from.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-1.1 | Create recipe | I am in the Meal Library | I add a new recipe with a name, meal type, servings, and at least one ingredient | The recipe is saved and appears in the library **[User]** |
| AC-1.2 | Edit recipe | An existing recipe | I open it and change any field | The changes are persisted and reflected in the library **[User]** |
| AC-1.3 | Delete recipe | An existing recipe | I delete it and confirm | The recipe is removed from the library and future searches **[User]** |
| AC-1.4 | Optional fields | A recipe being created | I leave notes and link empty | The recipe still saves successfully **[Inferred]** |
| AC-1.5 | Validation failure | A recipe being created | I attempt to save it with no name or no ingredients | An error is shown, the recipe is not saved, and my input is preserved **[Inferred]** |
| AC-1.6 | Save failure | A recipe create/edit/delete | The server-side save fails | An error indicates the change was not saved, and the prior state is not silently lost **[Inferred]** |

**Priority**: Must Have
**Goal**: Primary
**Dependencies**: platform-foundation FR-1 (persistence)

---

### FR-2: Ingredient Lookup via USDA FoodData Central

**Description**: When adding ingredients to a recipe, users can search the USDA FoodData Central API and select a food item; the system retrieves its nutrition data (macros and vitamins/minerals) for use in calculations. **[User]**

**User Story**: As a household member, I want to search a nutrition database for ingredients so that accurate nutrition data is attached without manual entry.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-2.1 | Search returns matches | I am adding an ingredient | I type a food name (e.g. "chicken breast") | Matching foods from USDA FoodData Central are shown to choose from **[User]** |
| AC-2.2 | Selection attaches nutrition | A search result list | I select a food and enter a quantity and unit | The ingredient is added to the recipe with its nutrition data attached **[User]** |
| AC-2.3 | API failure fallback | The nutrition API is slow or unavailable | I attempt an ingredient search | A clear error is shown and I can still add a custom ingredient (FR-3) instead of being blocked **[User]** |
| AC-2.4 | API key not exposed | Any ingredient search | The request is made | The external API key is used server-side and never sent to or visible in the browser **[User]** |

**Priority**: Must Have
**Goal**: Secondary-1
**Dependencies**: platform-foundation FR-1

---

### FR-3: Custom Ingredients

**Description**: Users can manually create a custom ingredient by entering its nutrition facts (macros and, optionally, vitamins/minerals) for items not available in the external API. Custom ingredients can be added to recipes like any API-sourced ingredient. **[User]**

**User Story**: As a household member, I want to enter nutrition facts for a custom ingredient so that I can accurately track foods the nutrition API doesn't have.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-3.1 | Create custom ingredient | I am adding ingredients to a recipe | I choose "custom" and enter a name and nutrition facts | The custom ingredient is created and added to the recipe **[User]** |
| AC-3.2 | Custom contributes to calc | A recipe containing a custom ingredient | Nutrition is calculated | The custom ingredient's values are included in the recipe's totals (FR-4) **[Inferred]** |
| AC-3.3 | Reuse a custom ingredient | A custom ingredient created previously | I add ingredients to another recipe | I can find and reuse the previously created custom ingredient **[Inferred]** |

**Priority**: Must Have
**Goal**: Secondary-1
**Dependencies**: platform-foundation FR-1

---

### FR-4: Automatic Nutrition Calculation

**Description**: The system automatically calculates a recipe's nutrition — macros (calories, protein, carbohydrates, fat, fiber) and vitamins/minerals — by summing its ingredients, scaled by each ingredient's quantity and unit, and presents both per-recipe and per-serving values based on the recipe's servings. **[User]**

**User Story**: As a household member, I want a recipe's nutrition computed automatically from its ingredients so that I don't have to do the math myself.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-4.1 | Macro totals | A recipe with ingredients having quantities and units | I view the recipe | Macro totals — calories, protein, carbohydrates, fat, and fiber — are shown, scaled correctly by quantity/unit **[User]** |
| AC-4.2 | Vitamins/minerals | A recipe with ingredients carrying vitamin/mineral data | I view the recipe | Aggregated vitamin/mineral content is shown, covering at least the vitamins/minerals returned by the data source **[User]** |
| AC-4.3 | Per-serving values | A recipe with a servings count greater than 1 | I view the recipe | Both total and per-serving nutrition are shown, divided by servings **[Inferred]** |
| AC-4.4 | Recalculation on edit | An existing recipe | I change an ingredient, its quantity/unit, or the servings count | The nutrition breakdown updates to reflect the change **[Inferred]** |
| AC-4.5 | Unit conversion | An ingredient entered in a non-gram unit (cup, tbsp, qty) | Nutrition is calculated | The quantity is converted consistently so totals are accurate **[Inferred]** |

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
| AC-5.3 | Filter by meal type | A library with recipes of various meal types | I filter by a meal type | Only recipes of that meal type are shown **[User]** |

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
| AC-6.2 | No matches | A search with no matching recipes | The search completes | An empty-state message is displayed rather than a blank screen **[Inferred]** |

**Priority**: Must Have
**Goal**: Primary
**Dependencies**: FR-1

---

## Non-Functional Requirements

### NFR-1: Performance (Smoothness, not strict latency)
**Category**: Performance
**Description**: UI feels smooth; nutrition calculations prioritize accuracy over speed (no hard latency cap). **[User]**
**Metric**: Perceived smoothness; no forced latency cap on calculation.
**Target**: Common interactions feel immediate; calculation correctness takes precedence over speed. **[User]**
**Verification**: Manual interaction testing.

### NFR-2: Usability & Mobile Friendliness
**Category**: Usability
**Description**: Responsive and usable on phones and desktops; WCAG 2.1 AA basics. **[User]**
**Metric**: Layout adapts; core flows completable on a phone.
**Target**: Recipe CRUD, search/filter, and viewing nutrition are completable on a phone and desktop. **[User]**
**Verification**: Manual testing across viewports.

### NFR-3: Nutrition Accuracy
**Category**: Correctness
**Description**: Nutrition breakdowns accurately reflect ingredient quantities, unit conversions, and serving counts. **[User]**
**Metric**: Computed totals match the sum of ingredient contributions after unit/serving scaling.
**Target**: Calculated macros and vitamins/minerals match expected values for known test recipes within a defined rounding tolerance. **[Inferred]**
**Verification**: Unit tests over representative recipes with mixed units and serving counts.

### NFR-4: External-API Cost
**Category**: Cost
**Description**: Stay within the USDA FoodData Central free tier; cache responses to limit calls. **[User]**
**Metric**: USDA API call count vs free-tier limit.
**Target**: Within the free-tier rate limit; cache ingredient lookups. **[Inferred]**
**Verification**: Review API call counts; confirm cache hits.

### NFR-5: Reliability (External API Degradation)
**Category**: Reliability
**Description**: Degrade gracefully when USDA is slow/unavailable: clear error, cached lookups where possible, and always allow custom-ingredient entry. **[User]**
**Metric**: Behavior under API failure/timeout.
**Target**: On failure, a clear message and a usable fallback (cache or custom entry); no unhandled errors. **[User]**
**Verification**: Simulate API timeout/outage and confirm fallback paths.

---

## Scope

### In Scope
- Recipe CRUD with ingredients (quantity + unit), meal type, servings, notes, optional link, custom tags. **[User]**
- Ingredient lookup via USDA FoodData Central plus custom user-entered ingredients. **[User]**
- Automatic per-recipe and per-serving nutrition calculation (macros + vitamins/minerals). **[User]**
- Tagging, tag/meal-type filtering, and text search. **[User]**

### Out of Scope
- Weekly planning (`weekly-planner`). **[User]**
- Persistence/deployment base (`platform-foundation`). **[User]**

### Constraints
- USDA FoodData Central is the primary ingredient nutrition source. **[User]**
- USDA API keys must never be exposed to the client. **[User]**
- Nutrition accuracy takes precedence over calculation speed. **[User]**

### Assumptions
- USDA Foundation + SR Legacy coverage is adequate; gaps filled by custom entry. **[User]**
- Micronutrients are stored/aggregated as absolute mass (mg/mcg); %DV is an optional display. **[User]**
- Volume units convert via per-ingredient gram-equivalents, confirmed at entry. **[User]**

### Risks
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| USDA coverage/accuracy incomplete for some foods | Medium | Medium | Custom-ingredient entry fills gaps; cache and validate |
| USDA availability/rate limits | Medium | Medium | Cache lookups; degrade gracefully; allow custom entry |
| Unit-conversion errors produce inaccurate totals | High | Medium | Per-ingredient gram-equivalents + confirm; unit tests (NFR-3) |
| Treating missing nutrients as zero understates totals | High | Medium | Treat missing as unknown; flag incompleteness |

## Dependencies

### External Systems
- USDA FoodData Central API. **[User]**

### Internal Dependencies
- `platform-foundation` (persistence, workspace, deployment). **[User]**

## Open Questions

_Resolved during the originating spec: USDA FoodData Central as the data source; micronutrients as absolute mass._

## Agent Decisions

| # | Decision | Context | Rationale | Affects |
|---|----------|---------|-----------|---------|
| 1 | Carved recipe + nutrition features into one spec | User split the MVP into three specs | These FRs form the cohesive "Meal Library" tab and share the nutrition engine | FR-1..FR-6 |
