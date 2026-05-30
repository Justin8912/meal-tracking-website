# Bundle 6: Integration & Verification

> Slice 3: Integration (Stage: integration)
> Stage: integration | Parallel: no | Files: (verification — e2e/test specs) apps/web/e2e/*, apps/api/test/*, packages/nutrition-engine/src/*.test.ts

**Bundle Verify**: The recipe library works end-to-end — create a recipe with accurate nutrition, degrade gracefully when USDA is down, and remain usable on mobile.
- **Level**: e2e
- **Given**: the full stack (platform + recipe-library) running via docker compose
- **Action**: run the e2e suite (recipe→nutrition, USDA-outage fallback) and the accuracy + responsive checks
- **Outcome**: all flows pass; nutrition matches hand-verified values within tolerance; the UI is usable at a phone viewport

> **Context**
>
> **Applicable ACs**
> - **AC-2.3**: Given: the nutrition API is unavailable / When: I attempt a search / Then: a clear error is shown and I can still add a custom ingredient
> - **AC-3.2**: Given: a recipe containing a custom ingredient / When: nutrition is calculated / Then: the custom ingredient's values are included
> - **AC-4.1**: Given: a recipe with ingredients / When: I view it / Then: macro totals are shown, scaled correctly
>
> **Architecture Decisions**
> - **AD-1: Pure, shared, TDD nutrition-engine** — accuracy verified against hand-verified recipes (NFR-3).
> - **AD-3: USDA proxy with graceful degradation** — outage path verified end-to-end.
> - **AD-5: Responsive library UI** — verified at mobile viewport (NFR-2).
>
> **Risks**
> - Per-ingredient density data incomplete, degrading accuracy (Impact: medium | Mitigation: accuracy suite + completeness flags)
> - Treating missing nutrients as zero understates totals (Impact: high | Mitigation: accuracy suite asserts completeness, not zeros)

#### STEP-44: End-to-end recipe → nutrition flow
MANUAL -> End-to-end verification of recipe creation with accurate nutrition

> **Intent**: Bundles verify pieces; this proves the wired whole. A user creating a recipe with a USDA ingredient and a custom ingredient must see correct combined nutrition through the real stack (web→api→engine→db) — catching integration gaps (snapshot wiring, query keys, engine inputs) that component/integration tests miss individually.

- With the full stack up, create a recipe (one USDA ingredient via the proxy, one custom) and save it
- Open it from the library and confirm macros + per-serving render correctly via the shared engine
- Assert the recipe persists and reloads with the same nutrition

**Verify**:
- Level: e2e | Given: the full stack running | Action: create a recipe with a USDA + a custom ingredient, save, reload | Outcome: the recipe persists; combined macro + per-serving nutrition renders correctly and is stable on reload

> Depends on: STEP-37, STEP-39 | Enables: STEP-45 | Parallel with: —

#### STEP-45: USDA-degradation end-to-end
MANUAL -> Verify graceful degradation when USDA is unavailable

> **Intent**: AC-2.3 must hold under a real outage, not just a stubbed unit. With USDA forced unreachable and an empty cache, ingredient search must show a clear error and the custom-entry path must let the user proceed — the user is never blocked. This is the reliability guarantee (NFR-5) that distinguishes a usable app from one that breaks when an external dependency hiccups.

- With USDA unreachable (block the upstream) and the cache cold, perform an ingredient search in the editor
- Confirm a clear error message appears and the custom-ingredient path is offered and works
- Confirm a previously cached lookup still resolves from cache during the outage

**Verify**:
- Level: e2e | Given: USDA unreachable, cold cache | Action: search an ingredient, then add a custom one | Outcome: clear error shown; custom entry succeeds; a previously cached item still resolves (AC-2.3)

> Depends on: STEP-44 | Enables: — | Parallel with: STEP-46

#### STEP-46: Nutrition accuracy verification
MANUAL -> Verify nutrition accuracy against hand-verified recipes (NFR-3)

> **Intent**: NFR-3 is the product's core promise. This consolidates the engine's accuracy guarantee with a corpus of hand-verified recipes spanning mixed units (g/cup/tbsp/qty), multiple servings, custom ingredients (AC-3.2), and missing-data cases — asserting computed totals match expected within the agreed tolerance and that incomplete recipes are flagged, not silently zeroed. This is where the design's deferred "rounding tolerance + corpus" open item is pinned down.

- Define the hand-verified test-recipe corpus (mixed units, multi-serving, a custom ingredient, a missing-data case) and the rounding tolerance (e.g. ±1 kcal, ±0.5 g)
- Assert computeRecipeNutrition matches expected totals within tolerance for each
- Assert the missing-data recipe reports completeness.complete=false (no zero-fill); the custom ingredient contributes (AC-3.2)

**Verify**:
- Level: unit | Given: the hand-verified corpus | Action: run the accuracy suite | Outcome: every recipe's macros + micros match expected within tolerance; missing-data flagged not zeroed; custom ingredient included (NFR-3, AC-3.2, AC-4.1)

> Depends on: STEP-17, STEP-27 | Enables: — | Parallel with: STEP-45

#### STEP-47: Mobile-responsive verification
MANUAL -> Verify the Meal Library is usable on a phone viewport (NFR-2)

> **Intent**: NFR-2 requires the library and editor to be usable on a phone, not just desktop. This checks the core flows (browse/filter/search, open the editor, add an ingredient, see nutrition) at a phone viewport so layout breakage (overflowing forms, unreachable controls) is caught before release.

- Run the e2e suite (or a responsive check) at a phone viewport (e.g. 390px) over the core library + editor flows
- Confirm controls are reachable and content does not overflow/clip
- Confirm WCAG 2.1 AA basics (labels, focus order) on the editor form

**Verify**:
- Level: e2e | Given: a 390px viewport | Action: browse, filter, search, open the editor, add an ingredient | Outcome: all flows are completable; no overflow/clipping; form controls are labeled and focusable (NFR-2)

> Depends on: STEP-43, STEP-37 | Enables: — | Parallel with: —
