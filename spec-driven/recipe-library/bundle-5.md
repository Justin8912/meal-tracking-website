# Bundle 5: Meal Library UI

> Slice 2: Feature Depth (Stage: depth)
> Stage: depth | Parallel: no (extends MealLibrary.tsx / query/recipes.ts from Bundle 1) | Files: apps/web/src/components/RecipeEditor.tsx, apps/web/src/components/IngredientPicker.tsx, apps/web/src/views/MealLibrary.tsx, apps/web/src/query/recipes.ts

**Bundle Verify**: A user can create/edit a recipe with USDA/custom ingredients and see live nutrition, then filter and search the library on mobile and desktop.
- **Level**: e2e
- **Given**: the API (Bundles 1,3,4) and engine (Bundle 2) running
- **Action**: open the recipe editor, add a USDA ingredient and a custom one, adjust servings, then filter and search the library
- **Outcome**: nutrition updates live as ingredients/servings change; filters and search narrow the list; the layout is usable on a phone viewport

> **Context**
>
> **Applicable ACs**
> - **AC-1.1**: Given: I am in the Meal Library / When: I add a new recipe / Then: it is saved and appears in the library
> - **AC-2.1**: Given: I am adding an ingredient / When: I type a food name / Then: matching USDA foods are shown
> - **AC-3.1**: Given: I am adding ingredients / When: I choose custom and enter nutrition / Then: the custom ingredient is created and added
> - **AC-4.4**: Given: an existing recipe / When: I change an ingredient, quantity/unit, or servings / Then: the nutrition breakdown updates to reflect the change
> - **AC-5.2**: Given: tagged recipes / When: I select a tag filter / Then: only recipes with that tag are shown
> - **AC-5.3**: Given: recipes of various meal types / When: I filter by a meal type / Then: only that meal type is shown
> - **AC-6.1**: Given: a library of recipes / When: I type into search / Then: matching recipes are shown
> - **AC-6.2**: Given: a search with no matches / When: it completes / Then: an empty-state message is shown rather than a blank screen
>
> **Architecture Decisions**
> - **AD-5: Library UI server state via TanStack Query; live nutrition via the shared engine** — Decision: TanStack Query for queries/mutations; the recipe editor calls the shared engine to recompute nutrition live; views responsive with WCAG 2.1 AA basics. Rationale: instant recalc (AC-4.4); responsive React satisfies NFR-2.
> - **AD-4: Per-ingredient gram-equivalents + confirm-at-entry** — Decision: pre-fill computed grams at entry, let the user confirm/override.
>
> **Findings**
> - **F-1: Prototype is React; components/math port directly** — RecipeEditor/IngredientPicker port from the prototype into responsive components.
> - **F-2: TanStack Query handles async reads/writes** — filter/search via query keys; mutations invalidate the list.
>
> **Standards**
> - **S-3**: Validate API inputs/outputs with shared Zod schemas (Domain: api-design | File Type: .ts)
> - **S-6**: Round nutrition only at display; never zero-fill missing data (Domain: other | File Type: .tsx)
> - **S-7**: No emojis (Domain: other | File Type: *)
>
> **Contracts**
> - GET /recipes?q=&mealType=&tag=, POST/PUT /recipes — library + editor
> - GET /ingredients/search, POST /ingredients — ingredient picker

#### STEP-36: Test-first — RecipeEditor live nutrition
MANUAL -> Test-first for STEP-37

> **Intent**: AC-4.4 is the defining UX of the editor — nutrition must update the instant an ingredient, quantity/unit, or servings changes, computed in the browser via the shared engine (AD-5), not via a server round-trip. The test must change servings and assert the displayed per-serving values change accordingly using the shared engine + display formatter (S-6), and that incomplete data shows the completeness flag rather than zeros.

- Write a component test (Vitest + testing-library): render RecipeEditor with two ingredients; change servings 1→2 and assert per-serving values halve (via the shared engine); an ingredient with missing data shows an "incomplete" indicator, not 0
- Tests fail before STEP-37

**Verify**:
- Level: unit | Given: the editor test | Action: run before STEP-37 | Outcome: fail (component not implemented)

> Depends on: STEP-17 | Enables: STEP-37 | Parallel with: —

#### STEP-37: RecipeEditor with live nutrition
[FR-1 -> AC-1.1 | FR-4 -> AC-4.4] | create `apps/web/src/components/RecipeEditor.tsx` | Effort: M

> **Intent**: The editor recomputes nutrition live by calling `computeRecipeNutrition` + `formatNutrition` from the shared engine on every ingredient/quantity/unit/servings change (AC-4.4, AD-5) — never round in the component (S-6), and surface the engine's completeness flag so users see when data is incomplete rather than misleadingly-zeroed totals. Saving goes through the TanStack Query mutation (invalidates the list).
> **Standards**: S-3, S-6, S-7

- Build the recipe form (name, meal type, servings, ingredients, notes, link, tags)
- On any change, recompute nutrition via the shared engine and render via formatNutrition; show the completeness flag when incomplete
- Save via a TanStack Query mutation; invalidate the recipes list on success
- Make the layout responsive (NFR-2)

**Verify**:
- Level: unit | Given: a recipe in the editor | Action: change servings 1→2 | Outcome: per-serving values halve live (shared engine); incomplete data shows the flag, not 0 — STEP-36 tests pass
- Level: integration | Given: the editor | Action: save a valid recipe | Outcome: it appears in the library (mutation invalidates the list)

> Depends on: STEP-36, STEP-29, STEP-7 | Enables: — | Parallel with: STEP-39

#### STEP-38: Test-first — IngredientPicker
MANUAL -> Test-first for STEP-39

> **Intent**: The picker covers both ingredient sources and the degradation path: USDA search results, custom entry, and — when search fails — a clear prompt to add a custom ingredient (AC-2.3 from the UI side). It also pre-fills the gram weight for confirmation (AD-4). Tests must assert search renders results, the custom path adds an ingredient, and a failed search surfaces the custom-entry fallback.

- Write component tests: typing shows USDA results (mocked); selecting pre-fills a confirmable gram weight; the custom path adds an ingredient; a failed search shows the "add custom" fallback
- Tests fail before STEP-39

**Verify**:
- Level: unit | Given: the picker test | Action: run before STEP-39 | Outcome: fail (component not implemented)

> Depends on: STEP-23 | Enables: STEP-39 | Parallel with: —

#### STEP-39: IngredientPicker (USDA search + custom + gram confirm)
[FR-2 -> AC-2.1 | FR-3 -> AC-3.1] | create `apps/web/src/components/IngredientPicker.tsx` | Effort: M

> **Intent**: Searches via `/ingredients/search` (debounced TanStack Query) and shows matches (AC-2.1); on selection, pre-fills the computed grams for the chosen quantity/unit and lets the user confirm/override (AD-4). When search errors (AC-2.3), it surfaces a clear message and the custom-entry form (AC-3.1) so the user is never blocked.
> **Standards**: S-3, S-7

- Debounced USDA search via TanStack Query against /ingredients/search; render matches
- On select: pre-fill the gram weight (per-ingredient equivalent) for confirm/override
- Provide a custom-ingredient form (name + nutrition) posting to /ingredients
- On search error, show a clear message + the custom-entry path

**Verify**:
- Level: integration | Given: mocked USDA results | Action: search and select an ingredient | Outcome: matches shown; selection pre-fills a confirmable gram weight (AC-2.1)
- Level: integration | Given: search returns an error | Action: search | Outcome: a clear message + custom-entry form appear (not a blocked UI) (AC-2.3/AC-3.1)

> Depends on: STEP-38, STEP-23, STEP-25 | Enables: — | Parallel with: STEP-37

#### STEP-40: Test-first — tag/meal-type filter UI
MANUAL -> Test-first for STEP-41

> **Intent**: The filter controls drive the server-side filters (Bundle 4) via TanStack Query keys, so changing a filter refetches the narrowed list (AC-5.2/5.3). Tests must assert selecting a tag/meal-type updates the query key and the rendered list reflects the filtered response.

- Write component tests: selecting a tag filter and a meal-type filter updates the query (keyed) and renders only the filtered recipes (mocked responses)
- Tests fail before STEP-41

**Verify**:
- Level: unit | Given: the filter UI test | Action: run before STEP-41 | Outcome: fail (filters not wired)

> Depends on: STEP-7 | Enables: STEP-41 | Parallel with: —

#### STEP-41: Tag and meal-type filter UI
[FR-5 -> AC-5.2, AC-5.3] | modify `apps/web/src/views/MealLibrary.tsx`, `apps/web/src/query/recipes.ts` | Effort: S

> **Intent**: Filter controls set `tag`/`mealType` in the recipes query key (AD-5), so TanStack Query refetches the server-filtered list (Bundle 4) and caches per filter combination. Driving filters through the query key (not client-side array filtering) keeps the UI consistent with server results and scales.
> **Standards**: S-7

- Add tag and meal-type filter controls (tags from GET /tags); set them in the `useRecipes` query key
- Render the filtered list; show an empty state when a filter yields nothing
- Make controls usable on mobile (NFR-2)

**Verify**:
- Level: integration | Given: tagged recipes across meal types | Action: select tag=quick then mealType=dinner | Outcome: list shows only quick dinners (server-filtered via query key) — STEP-40 tests pass

> Depends on: STEP-40, STEP-33, STEP-31 | Enables: — | Parallel with: STEP-43

#### STEP-42: Test-first — search box and empty state
MANUAL -> Test-first for STEP-43

> **Intent**: AC-6.2 specifically requires an empty-state message (not a blank screen) when search has no matches. Tests must assert typing updates the query and that a no-match response renders the empty-state message, distinct from the loading state.

- Write component tests: typing in the search box updates the recipes query (debounced); a no-match response renders an empty-state message; a populated response renders the list
- Tests fail before STEP-43

**Verify**:
- Level: unit | Given: the search UI test | Action: run before STEP-43 | Outcome: fail (search box not wired)

> Depends on: STEP-7 | Enables: STEP-43 | Parallel with: —

#### STEP-43: Search box and empty state
[FR-6 -> AC-6.1, AC-6.2] | modify `apps/web/src/views/MealLibrary.tsx` | Effort: S

> **Intent**: The search box sets `q` in the recipes query key (debounced) so results come from the server search (Bundle 4, AC-6.1). When the response is empty it must render a clear empty-state message (AC-6.2) — distinguishable from the loading and initial states so the user isn't left staring at a blank panel.
> **Standards**: S-7

- Add a debounced search input setting `q` in the `useRecipes` query key
- Render results; on an empty result render an explicit empty-state message ("No recipes found")
- Distinguish loading vs empty vs populated states

**Verify**:
- Level: integration | Given: recipes incl. "Chicken Bowl" | Action: type "chick" then "zzz" | Outcome: "chick" shows Chicken Bowl (AC-6.1); "zzz" shows the empty-state message, not a blank screen (AC-6.2) — STEP-42 tests pass

> Depends on: STEP-42, STEP-35 | Enables: — | Parallel with: STEP-41
