# Bundle 2: Nutrition Engine (TDD core)

> Slice 2: Feature Depth (Stage: depth)
> Stage: depth | Parallel: yes (file-disjoint from Bundles 3-5; depends only on Bundle 1 shared types) | Files: packages/nutrition-engine/src/units.ts, packages/nutrition-engine/src/compute.ts, packages/nutrition-engine/src/format.ts, packages/nutrition-engine/src/*.test.ts

**Bundle Verify**: The nutrition engine computes accurate per-recipe and per-serving nutrition for representative recipes with mixed units and missing data.
- **Level**: unit
- **Given**: the engine and a hand-verified test recipe (mixed g/cup/qty ingredients, 2 servings, one ingredient missing a micronutrient)
- **Action**: call computeRecipeNutrition(ingredients, servings)
- **Outcome**: macro totals and per-serving values match the hand-verified expectation within tolerance; micronutrients are summed as a union; completeness flags the missing-data ingredient (not zero-filled)

> **Context**
>
> **Applicable ACs**
> - **AC-4.1**: Given: a recipe with ingredients having quantities and units / When: I view the recipe / Then: macro totals (calories, protein, carbs, fat, fiber) are shown, scaled correctly by quantity/unit
> - **AC-4.2**: Given: a recipe with ingredients carrying vitamin/mineral data / When: I view the recipe / Then: aggregated vitamin/mineral content is shown
> - **AC-4.3**: Given: a recipe with servings > 1 / When: I view the recipe / Then: both total and per-serving nutrition are shown, divided by servings
> - **AC-4.5**: Given: an ingredient in a non-gram unit (cup, tbsp, qty) / When: nutrition is calculated / Then: the quantity is converted consistently so totals are accurate
>
> **Architecture Decisions**
> - **AD-1: Pure, shared, TDD nutrition-engine** — Decision: computeRecipeNutrition(...) -> { total, perServing, completeness }; per-100g scaling, full-precision accumulation, absolute-mass micronutrient union, round only at display, completeness descriptor. Rationale: one place to satisfy NFR-3; display-only rounding avoids compounding error (F-5); purity = testable + shareable.
> - **AD-4: Per-ingredient gram-equivalents with confirm-at-entry** — Decision: grams via mass / per-ingredient volume gram-equivalent / per-ingredient usual-weight for qty. Rationale: fixed factors are ~2x wrong (F-4).
>
> **Findings**
> - **F-3: Pure engine is extractable and shareable** — dependency-free module used by web + api.
> - **F-4: Fixed water-equivalent volume is ~2x off for flour** — per-ingredient gram-equivalents required.
> - **F-5: Round at display; flag missing data, don't zero it** — full precision internally; completeness descriptor.
>
> **Standards**
> - **S-1**: Nutrition-engine code is pure, dependency-free, unit-tested first (TDD) (Domain: testing | File Type: .ts)
> - **S-6**: Round nutrition only at display; never zero-fill missing data (Domain: other | File Type: .ts/.tsx)
> - **S-7**: No emojis (Domain: other | File Type: *)
>
> **Constraints**
> - Nutrition accuracy takes precedence over calc speed (Category: performance | Source: technical)
>
> **Risks**
> - Treating missing nutrients as zero understates totals (Impact: high | Mitigation: completeness flag, never zero-fill)
> - Per-ingredient density data incomplete (Impact: medium | Mitigation: flag via completeness, don't silent-estimate)

#### STEP-8: Test-first — unit conversion to grams
MANUAL -> Test-first for STEP-9

> **Intent**: Volume conversion is the #1 accuracy risk (F-4): 1 cup flour ≈125g, not 240g. Tests must assert per-ingredient gram-equivalents (different grams for the same unit across ingredients), grams pass through unchanged, and `qty` uses the ingredient's usual-weight. A test that only checks `g` would miss the density bug entirely.

- Write Vitest tests for `toGrams(quantity, unitCode, ingredient)`: g passes through; cup of flour vs cup of water yield different grams (per-ingredient); qty uses ingredient.gramWeightPerQty; missing gram-equivalent returns a flagged result, not a guess
- Tests fail before STEP-9

**Verify**:
- Level: unit | Given: the conversion tests | Action: run Vitest before STEP-9 | Outcome: tests fail (units module not implemented)

> Depends on: STEP-1 | Enables: STEP-9 | Parallel with: —

#### STEP-9: Unit-to-grams conversion
[FR-4 -> AC-4.5] | create `packages/nutrition-engine/src/units.ts` | Effort: S

> **Intent**: This is where AC-4.5 accuracy lives. Mass units pass straight through; volume units multiply by the ingredient's own gram-equivalent (NOT a global table — F-4); `qty` multiplies by the ingredient's usual-weight. When an ingredient lacks the needed gram-equivalent, return a signal the caller records in `completeness` (STEP-15) rather than substituting a default that silently corrupts totals.
> **Standards**: S-1 (pure, TDD), S-6, S-7

- Implement `toGrams(quantity, unitCode, ingredient)`: g→grams directly; volume→quantity * ingredient.gramEquivalents[unit]; qty→quantity * ingredient.gramWeightPerQty
- Return a discriminated result that marks when conversion data is missing (no silent default)
- Keep pure: no I/O, no Date

**Verify**:
- Level: unit | Given: flour vs water, 1 cup each | Action: toGrams | Outcome: different gram results per ingredient; qty uses usual-weight; missing data returns a flagged (not guessed) result — STEP-8 tests pass

> Depends on: STEP-8 | Enables: STEP-11 | Parallel with: —

#### STEP-10: Test-first — macro scaling and per-serving
MANUAL -> Test-first for STEP-11

> **Intent**: Macros scale as `per100g * grams/100`, summed across ingredients, then divided by servings (AC-4.1/4.3). Tests must use a multi-ingredient, multi-serving recipe with a hand-verified expected total and assert per-serving = total/servings exactly (full precision) — catching both wrong scaling and premature rounding.

- Write Vitest tests: a 2-ingredient, 2-serving recipe with known per-100g values yields the hand-verified macro total and per-serving = total/2; full precision retained (no mid-calc rounding)
- Tests fail before STEP-11

**Verify**:
- Level: unit | Given: the macro tests | Action: run Vitest before STEP-11 | Outcome: fail (compute not implemented)

> Depends on: STEP-1 | Enables: STEP-11 | Parallel with: —

#### STEP-11: Macro scaling and per-serving totals
[FR-4 -> AC-4.1, AC-4.3] | create `packages/nutrition-engine/src/compute.ts` | Effort: M

> **Intent**: The core accumulation. Scale each ingredient's macros by `toGrams(...)/100` (STEP-9), sum in full-precision floats, and divide by `max(servings,1)` for per-serving. Never round here — rounding is display-only (STEP-17, S-6); rounding mid-sum compounds error across ingredients and weeks.
> **Standards**: S-1, S-6, S-7

- Implement `computeRecipeNutrition(ingredients, servings)` macro path: sum calories/protein/carbs/fat/fiber via grams/100 scaling
- Compute perServing = total / max(servings,1); keep full float precision
- Return `{ total, perServing }` (micronutrients + completeness added in STEP-13/15)

**Verify**:
- Level: unit | Given: a 2-ingredient, 2-serving recipe | Action: computeRecipeNutrition | Outcome: macro total matches hand-verified value; perServing = total/2; no mid-calc rounding — STEP-10 tests pass

> Depends on: STEP-10, STEP-9 | Enables: STEP-13 | Parallel with: —

#### STEP-12: Test-first — micronutrient union
MANUAL -> Test-first for STEP-13

> **Intent**: Ingredients carry different micronutrient sets; aggregation is a keyed union summing matching nutrients (AC-4.2). Tests must combine ingredients with overlapping and disjoint micronutrient keys and assert the union sums correctly — a naive merge that overwrites instead of summing would pass a single-ingredient test but fail here.

- Write Vitest tests: two ingredients, one with {iron, vitC}, one with {iron, calcium}; assert result iron = sum, vitC and calcium present, all in absolute mass scaled by grams
- Tests fail before STEP-13

**Verify**:
- Level: unit | Given: the micronutrient tests | Action: run Vitest before STEP-13 | Outcome: fail (union not implemented)

> Depends on: STEP-1 | Enables: STEP-13 | Parallel with: —

#### STEP-13: Micronutrient absolute-mass union
[FR-4 -> AC-4.2] | modify `packages/nutrition-engine/src/compute.ts` | Effort: S

> **Intent**: Micronutrients are stored/aggregated as absolute mass (mg/mcg), which sums correctly across ingredients — unlike %DV (a deliberate program decision). Aggregate as a keyed union over nutrient name, scaling each by grams/100; absent keys contribute nothing (handled as completeness in STEP-15, not zero).
> **Standards**: S-1, S-6, S-7

- Extend computeRecipeNutrition to accumulate a micronutrient map (absolute mass) as a keyed union, scaled by grams/100
- Preserve units (mg/mcg) per nutrient; do not coerce to %DV
- Add micronutrients to both total and perServing

**Verify**:
- Level: unit | Given: two ingredients with overlapping+disjoint micros | Action: computeRecipeNutrition | Outcome: iron summed; vitC and calcium present; absolute mass scaled by grams — STEP-12 tests pass

> Depends on: STEP-12, STEP-11 | Enables: STEP-15 | Parallel with: —

#### STEP-14: Test-first — completeness descriptor
MANUAL -> Test-first for STEP-15

> **Intent**: AC-4.2 plus NFR-3 require that missing nutrient/conversion data is surfaced, not silently zeroed. Tests must include an ingredient with no micronutrients and one with a missing gram-equivalent, and assert `completeness.complete === false` with both flagged in `missing` — a zero-filling implementation would report `complete: true` and wrong totals.

- Write Vitest tests: a recipe with one no-micros ingredient and one missing a volume gram-equivalent → completeness.complete false, missing lists both with reasons; a fully-specified recipe → complete true
- Tests fail before STEP-15

**Verify**:
- Level: unit | Given: the completeness tests | Action: run Vitest before STEP-15 | Outcome: fail (completeness not implemented)

> Depends on: STEP-1 | Enables: STEP-15 | Parallel with: —

#### STEP-15: Completeness descriptor (no zero-fill)
[FR-4 -> AC-4.2] | modify `packages/nutrition-engine/src/compute.ts` | Effort: S

> **Intent**: This is the guardrail against the prototype's silent-zero behavior (F-5). When an ingredient has no nutrient data, or `toGrams` (STEP-9) couldn't resolve grams, record it in `completeness.missing` with a reason and leave it out of the sums — never substitute zero or a default weight. The UI uses this to flag incomplete recipes.
> **Standards**: S-1, S-6, S-7

- Extend computeRecipeNutrition to return `completeness: { complete, missing: [{ ingredientId, reason }] }`
- Record ingredients with absent nutrient data or unresolved grams; exclude them from sums (do not zero-fill)
- `complete` is true only when no ingredient was flagged

**Verify**:
- Level: unit | Given: a recipe with missing micros + a missing gram-equivalent | Action: computeRecipeNutrition | Outcome: completeness.complete false; both flagged with reasons; not zero-filled — STEP-14 tests pass

> Depends on: STEP-14, STEP-13 | Enables: STEP-17 | Parallel with: —

#### STEP-16: Test-first — display rounding
MANUAL -> Test-first for STEP-17

> **Intent**: Rounding happens only at the display boundary (S-6). Tests must confirm the formatter rounds for display while the underlying computed values stay full-precision, and that summing displayed (rounded) values is NOT how totals are produced — guarding against reintroducing compounding error.

- Write Vitest tests: given a full-precision nutrition result, the formatter produces rounded display values (e.g. integer kcal, 1-decimal grams) while the source result remains unrounded
- Tests fail before STEP-17

**Verify**:
- Level: unit | Given: the formatting tests | Action: run Vitest before STEP-17 | Outcome: fail (formatter not implemented)

> Depends on: STEP-1 | Enables: STEP-17 | Parallel with: —

#### STEP-17: Display formatting (round at display only)
[FR-4 -> AC-4.1] | create `packages/nutrition-engine/src/format.ts` | Effort: XS

> **Intent**: Keep rounding isolated in a display formatter so computation stays full-precision everywhere else (S-6). Both the web UI and any API serialization that shows numbers use this — centralizing it prevents callers from rounding ad hoc and reintroducing error.
> **Standards**: S-1, S-6, S-7

- Implement `formatNutrition(result)` returning display-rounded macros + micronutrients (integers/one-decimal as appropriate)
- Do not mutate the input; the source result stays unrounded
- Export from the engine barrel for web + api

**Verify**:
- Level: unit | Given: a full-precision result | Action: formatNutrition | Outcome: rounded display values returned; the source result is unchanged (still full precision) — STEP-16 tests pass

> Depends on: STEP-16, STEP-15 | Enables: STEP-37, STEP-46 | Parallel with: —
