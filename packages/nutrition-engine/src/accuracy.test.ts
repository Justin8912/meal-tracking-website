import { describe, it, expect } from 'vitest';
import { computeRecipeNutrition } from './compute.js';
import type { NutritionLine } from './types.js';

/**
 * STEP-46: nutrition accuracy verification (NFR-3, AC-3.2, AC-4.1).
 *
 * This is the consolidated accuracy guarantee for the recipe library. It pins
 * down the design's deferred "rounding tolerance + hand-verified corpus" open
 * item with an EXPLICIT, stated tolerance and a corpus that spans every path
 * the engine must get right:
 *
 *   - mixed units in ONE recipe: g (mass), cup + tbsp (per-ingredient
 *     gram-equivalents, F-4), and qty (per-ingredient usual weight);
 *   - multiple servings (per-serving = total / servings, full precision);
 *   - a CUSTOM ingredient that must contribute to the totals (AC-3.2);
 *   - a MISSING-DATA case that must be FLAGGED via completeness, never
 *     zero-filled (F-5, S-6) — covering both missing micronutrients AND, per
 *     the Bundle 5 limitation, missing MACROS.
 *
 * TOLERANCE (stated once, applied throughout):
 *   - calories: +/-1 kcal
 *   - macros (protein/carbs/fat/fiber): +/-0.5 g
 *   - micronutrients (mass): +/-0.5 (same unit)
 * The engine computes in full float precision (S-6); this tolerance is the
 * contractual display-side allowance, not a license to round mid-sum. The
 * arithmetic below is exact, so every assertion sits FAR inside the tolerance —
 * the tolerance is the published contract, the closeness is the proof.
 */
const KCAL_TOLERANCE = 1;
const GRAM_TOLERANCE = 0.5;
const MICRO_TOLERANCE = 0.5;

function expectCloseKcal(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(KCAL_TOLERANCE);
}
function expectCloseGram(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(GRAM_TOLERANCE);
}
function expectCloseMicro(actual: number | undefined, expected: number): void {
  expect(actual).toBeDefined();
  expect(Math.abs((actual ?? NaN) - expected)).toBeLessThanOrEqual(
    MICRO_TOLERANCE,
  );
}

/**
 * Hand-verified corpus recipe. 4 ingredients, mixed units, 4 servings, one
 * CUSTOM ingredient (protein powder) and one MISSING-DATA ingredient (olive
 * oil with no fiber reported). All per-100g unless noted.
 *
 * 1. Rolled oats (USDA-style)    150 g  -> factor 1.5
 *    per100g {cal 389, p 16.9, c 66.3, f 6.9, fib 10.6, iron 4.7mg}
 *    -> {cal 583.5, p 25.35, c 99.45, f 10.35, fib 15.9, iron 7.05mg}
 * 2. Whole milk (cup, 244 g/cup) 2 cup -> 488 g -> factor 4.88
 *    per100g {cal 42, p 3.4, c 5, f 1, fib 0, calcium 125mg}
 *    -> {cal 204.96, p 16.592, c 24.4, f 4.88, fib 0, calcium 610mg}
 * 3. Custom protein powder       2 tbsp (15 g/tbsp) -> 30 g -> factor 0.3
 *    per100g {cal 375, p 80, c 8, f 4, fib 2, (no micros)}    [CUSTOM, AC-3.2]
 *    -> {cal 112.5, p 24, c 2.4, f 1.2, fib 0.6}
 * 4. Olive oil (qty: 1 tbsp drizzle weighs 13.5 g) 1 qty -> 13.5 g -> factor 0.135
 *    per100g {cal 884, p 0, c 0, f 100, FIBER ABSENT (unknown, not 0)}  [MISSING-DATA]
 *    -> {cal 119.34, p 0, c 0, f 13.5, fib +0 (absent, flagged)}
 *
 * Totals (present macros summed; olive-oil fiber absent, oats/milk/powder
 * fiber summed):
 *   cal 583.5 + 204.96 + 112.5 + 119.34 = 1020.3
 *   p   25.35 + 16.592 + 24    + 0      = 65.942
 *   c   99.45 + 24.4   + 2.4   + 0      = 126.25
 *   f   10.35 + 4.88   + 1.2   + 13.5   = 29.93
 *   fib 15.9  + 0      + 0.6   + (absent) = 16.5
 *   micros {iron 7.05mg, calcium 610mg}
 * PerServing (/4):
 *   cal 255.075, p 16.4855, c 31.5625, f 7.4825, fib 4.125
 *   micros {iron 1.7625mg, calcium 152.5mg}
 */
const corpus: NutritionLine[] = [
  {
    quantity: 150,
    unitCode: 'g',
    ingredient: {
      id: 'oats',
      referenceGrams: 100,
      gramEquivalents: {},
      gramWeightPerQty: null,
      nutrition: {
        calories: 389,
        proteinG: 16.9,
        carbsG: 66.3,
        fatG: 6.9,
        fiberG: 10.6,
        micronutrients: { iron: { amount: 4.7, unit: 'mg' } },
      },
    },
  },
  {
    quantity: 2,
    unitCode: 'cup',
    ingredient: {
      id: 'milk',
      referenceGrams: 100,
      gramEquivalents: { cup: 244 },
      gramWeightPerQty: null,
      nutrition: {
        calories: 42,
        proteinG: 3.4,
        carbsG: 5,
        fatG: 1,
        fiberG: 0,
        micronutrients: { calcium: { amount: 125, unit: 'mg' } },
      },
    },
  },
  {
    // CUSTOM ingredient (AC-3.2): must contribute its macros to the totals.
    quantity: 2,
    unitCode: 'tbsp',
    ingredient: {
      id: 'custom-protein-powder',
      referenceGrams: 100,
      gramEquivalents: { tbsp: 15 },
      gramWeightPerQty: null,
      nutrition: {
        calories: 375,
        proteinG: 80,
        carbsG: 8,
        fatG: 4,
        fiberG: 2,
        // No micronutrients entered: macros count, recipe flagged incomplete.
        micronutrients: {},
      },
    },
  },
  {
    // MISSING-DATA (Bundle 5 limitation): olive oil with FIBER absent. The
    // source did not report fiber; it must be flagged, never read as a real 0.
    quantity: 1,
    unitCode: 'qty',
    ingredient: {
      id: 'olive-oil',
      referenceGrams: 100,
      gramEquivalents: {},
      gramWeightPerQty: 13.5,
      absentMacros: ['fiberG'],
      nutrition: {
        calories: 884,
        proteinG: 0,
        carbsG: 0,
        fatG: 100,
        fiberG: 0, // numeric placeholder for an ABSENT value (flagged below)
        micronutrients: {},
      },
    },
  },
];

describe('STEP-46 nutrition accuracy corpus (NFR-3)', () => {
  it('matches hand-verified TOTAL macros within tolerance (mixed units, custom, missing-data)', () => {
    const { total } = computeRecipeNutrition(corpus, 4);
    expectCloseKcal(total.calories, 1020.3);
    expectCloseGram(total.proteinG, 65.942);
    expectCloseGram(total.carbsG, 126.25);
    expectCloseGram(total.fatG, 29.93);
    expectCloseGram(total.fiberG, 16.5);
  });

  it('matches hand-verified PER-SERVING macros within tolerance (/4)', () => {
    const { perServing } = computeRecipeNutrition(corpus, 4);
    expectCloseKcal(perServing.calories, 255.075);
    expectCloseGram(perServing.proteinG, 16.4855);
    expectCloseGram(perServing.carbsG, 31.5625);
    expectCloseGram(perServing.fatG, 7.4825);
    expectCloseGram(perServing.fiberG, 4.125);
  });

  it('sums micronutrients as a mass union across ingredients within tolerance', () => {
    const { total, perServing } = computeRecipeNutrition(corpus, 4);
    expectCloseMicro(total.micronutrients.iron?.amount, 7.05);
    expect(total.micronutrients.iron?.unit).toBe('mg');
    expectCloseMicro(total.micronutrients.calcium?.amount, 610);
    expect(total.micronutrients.calcium?.unit).toBe('mg');
    expectCloseMicro(perServing.micronutrients.iron?.amount, 1.7625);
    expectCloseMicro(perServing.micronutrients.calcium?.amount, 152.5);
  });

  it('INCLUDES the custom ingredient contribution (AC-3.2)', () => {
    // Drop the custom powder and re-sum: the totals MUST differ, proving the
    // custom ingredient is counted (its 30 g @ factor 0.3 adds 112.5 kcal, 24 g
    // protein). A zero/ignored custom ingredient would make these equal.
    const withoutCustom = corpus.filter(
      (l) => l.ingredient.id !== 'custom-protein-powder',
    );
    const withAll = computeRecipeNutrition(corpus, 4).total;
    const without = computeRecipeNutrition(withoutCustom, 4).total;
    expectCloseGram(withAll.calories - without.calories, 112.5);
    expectCloseGram(withAll.proteinG - without.proteinG, 24);
  });

  it('FLAGS missing data (no zero-fill): missing-macros AND missing-micronutrients', () => {
    const { completeness } = computeRecipeNutrition(corpus, 4);
    expect(completeness.complete).toBe(false);
    // Collect ALL reasons per ingredient (one line can carry several gaps).
    const reasonsById = new Map<string, string[]>();
    for (const g of completeness.missing) {
      const list = reasonsById.get(g.ingredientId) ?? [];
      list.push(g.reason);
      reasonsById.set(g.ingredientId, list);
    }
    // olive oil: fiber was absent -> flagged missing-macros, NOT silently 0
    // (and it also has no micronutrients, so it carries that gap too).
    const oilReasons = reasonsById.get('olive-oil') ?? [];
    expect(oilReasons.some((r) => /missing-macros/.test(r))).toBe(true);
    expect(oilReasons.some((r) => /fiberG/.test(r))).toBe(true);
    // custom powder: no micronutrients -> flagged missing-micronutrients.
    expect(reasonsById.get('custom-protein-powder')).toContain(
      'missing-micronutrients',
    );
  });
});

/**
 * Bundle 5 limitation, made explicit (STEP-46).
 *
 * The web editor's `toEngineNutrition` coerces an API-ABSENT macro to 0 so the
 * engine arithmetic has a number to add (the accumulator is numeric and totals
 * must serialize). Before this bundle the engine had NO way to tell "the user
 * really logged 0 g fiber" apart from "the source never reported fiber" — so a
 * recipe built from such an ingredient reported `complete: true` with an
 * understated total: a silent zero-fill, violating S-6/F-5.
 *
 * The guard: an ingredient may declare `absentMacros`. When present, the engine
 * still sums the macros it has (the absent one unavoidably adds 0) BUT flags the
 * line `missing-macros`, so `completeness.complete` is false. The contract is
 * now explicit: missing macros surface via the completeness flag, never as a
 * real 0 total. These two cases share identical macro inputs and differ ONLY in
 * the `absentMacros` marker, proving the flag — not the numbers — carries the
 * "unknown vs zero" distinction.
 */
describe('STEP-46 macro-completeness guard (Bundle 5 limitation)', () => {
  const known0Fiber: NutritionLine = {
    quantity: 100,
    unitCode: 'g',
    ingredient: {
      id: 'sugar',
      referenceGrams: 100,
      gramEquivalents: {},
      gramWeightPerQty: null,
      // Fiber is genuinely 0 (the user knows it). No absentMacros marker.
      nutrition: {
        calories: 387,
        proteinG: 0,
        carbsG: 100,
        fatG: 0,
        fiberG: 0,
        micronutrients: { calcium: { amount: 1, unit: 'mg' } },
      },
    },
  };
  const unknownFiber: NutritionLine = {
    quantity: 100,
    unitCode: 'g',
    ingredient: {
      ...known0Fiber.ingredient,
      id: 'mystery-syrup',
      // Same numbers, but fiber was NEVER reported (unknown, not zero).
      absentMacros: ['fiberG'],
    },
  };

  it('treats a genuine 0 macro as complete (no false flag)', () => {
    const { completeness } = computeRecipeNutrition([known0Fiber], 1);
    expect(completeness.complete).toBe(true);
    expect(completeness.missing).toEqual([]);
  });

  it('flags an ABSENT macro as missing despite identical macro numbers', () => {
    const { total, completeness } = computeRecipeNutrition([unknownFiber], 1);
    // The known macros still contribute fully...
    expectCloseKcal(total.calories, 387);
    expectCloseGram(total.carbsG, 100);
    // ...but the recipe is NOT reported complete: the absent fiber is surfaced,
    // not silently read as a real 0 (S-6, F-5).
    expect(completeness.complete).toBe(false);
    const gap = completeness.missing.find(
      (g) => g.ingredientId === 'mystery-syrup',
    );
    expect(gap?.reason).toMatch(/missing-macros/);
    expect(gap?.reason).toMatch(/fiberG/);
  });

  it('lists every absent macro key when several are unknown', () => {
    const line: NutritionLine = {
      quantity: 50,
      unitCode: 'g',
      ingredient: {
        id: 'partial',
        referenceGrams: 100,
        gramEquivalents: {},
        gramWeightPerQty: null,
        absentMacros: ['proteinG', 'fatG', 'fiberG'],
        nutrition: {
          calories: 200,
          proteinG: 0,
          carbsG: 40,
          fatG: 0,
          fiberG: 0,
          micronutrients: { iron: { amount: 1, unit: 'mg' } },
        },
      },
    };
    const { completeness } = computeRecipeNutrition([line], 1);
    const gap = completeness.missing.find((g) => g.ingredientId === 'partial');
    // keys are sorted + comma-joined for a stable, UI-friendly reason
    expect(gap?.reason).toBe('missing-macros: fatG,fiberG,proteinG');
  });
});
