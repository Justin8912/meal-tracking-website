import { describe, it, expect } from 'vitest';
import { computeRecipeNutrition } from './compute.js';
import type { NutritionLine } from './types.js';

/**
 * STEP-14 (test-first for STEP-15): completeness descriptor (no zero-fill).
 *
 * AC-4.2 + NFR-3 require missing nutrient/conversion data to be surfaced, never
 * silently zeroed (F-5). Two distinct gaps exist, with DIFFERENT consequences:
 *
 * - UNRESOLVED GRAMS: `toGrams` cannot resolve grams (e.g. a volume unit with no
 *   per-ingredient gram-equivalent). We genuinely cannot compute that line's
 *   contribution, so it is EXCLUDED from both macro and micronutrient sums and
 *   recorded with reason `unresolved-grams`.
 * - MISSING/PARTIAL MICRONUTRIENTS: the line resolves to grams but carries an
 *   empty or partial micronutrient map. Its macros (and whatever micros it does
 *   have) STILL contribute to the sums; we simply never zero-fill the absent
 *   micronutrients. It is recorded with reason `missing-micronutrients` so the
 *   recipe is flagged incomplete.
 *
 * `completeness.complete` is true IFF `completeness.missing` is empty.
 *
 * A zero-filling implementation would report `complete: true` with wrong totals;
 * an over-eager exclusion would drop the empty-micros ingredient's macros.
 */
const incomplete: NutritionLine[] = [
  // (a) macros present, but micronutrient map empty -> macros still counted,
  // flagged missing-micronutrients (never zero-filled).
  {
    quantity: 200,
    unitCode: 'g',
    ingredient: {
      id: 'macros-only',
      referenceGrams: 100,
      gramEquivalents: {},
      gramWeightPerQty: null,
      nutrition: {
        calories: 100,
        proteinG: 10,
        carbsG: 5,
        fatG: 2,
        fiberG: 1,
        micronutrients: {},
      },
    },
  },
  // (b) volume unit with NO gram-equivalent -> grams unresolved, excluded
  // entirely from sums, flagged unresolved-grams.
  {
    quantity: 1,
    unitCode: 'cup',
    ingredient: {
      id: 'no-conversion',
      referenceGrams: 100,
      gramEquivalents: {},
      gramWeightPerQty: null,
      nutrition: {
        calories: 999,
        proteinG: 99,
        carbsG: 99,
        fatG: 99,
        fiberG: 99,
        micronutrients: { iron: { amount: 5, unit: 'mg' } },
      },
    },
  },
];

describe('computeRecipeNutrition - completeness', () => {
  it('flags an incomplete recipe with both distinct reasons', () => {
    const { completeness } = computeRecipeNutrition(incomplete, 1);
    expect(completeness.complete).toBe(false);
    const byId = Object.fromEntries(
      completeness.missing.map((g) => [g.ingredientId, g.reason]),
    );
    expect(Object.keys(byId).sort()).toEqual(['macros-only', 'no-conversion']);
    expect(byId['macros-only']).toBe('missing-micronutrients');
    expect(byId['no-conversion']).toMatch(/unresolved-grams/);
    // the unresolved-grams reason should surface the unit it could not convert
    expect(byId['no-conversion']).toMatch(/cup/);
  });

  it('counts the empty-micros ingredient macros but EXCLUDES the unresolved-grams line', () => {
    const { total } = computeRecipeNutrition(incomplete, 1);
    // Only macros-only (200 g -> factor 2) contributes; no-conversion excluded.
    expect(total.calories).toBeCloseTo(200, 9);
    expect(total.proteinG).toBeCloseTo(20, 9);
    expect(total.carbsG).toBeCloseTo(10, 9);
    expect(total.fatG).toBeCloseTo(4, 9);
    expect(total.fiberG).toBeCloseTo(2, 9);
    // the unresolved line's iron must NOT leak into the union
    expect(total.micronutrients.iron).toBeUndefined();
    // the empty-micros line never zero-fills micronutrients
    expect(Object.keys(total.micronutrients)).toEqual([]);
  });

  it('reports complete with empty missing for a fully-specified recipe', () => {
    const complete: NutritionLine[] = [
      {
        quantity: 100,
        unitCode: 'g',
        ingredient: {
          id: 'full',
          referenceGrams: 100,
          gramEquivalents: {},
          gramWeightPerQty: null,
          nutrition: {
            calories: 50,
            proteinG: 5,
            carbsG: 5,
            fatG: 1,
            fiberG: 1,
            micronutrients: { iron: { amount: 2, unit: 'mg' } },
          },
        },
      },
    ];
    const { completeness } = computeRecipeNutrition(complete, 1);
    expect(completeness.complete).toBe(true);
    expect(completeness.missing).toEqual([]);
  });
});

/**
 * Bundle Verify: hand-verified recipe with mixed g/cup/qty units, 2 servings,
 * and one ingredient missing a micronutrient (empty map). Tolerance: +/-1 kcal,
 * +/-0.5 g on macros (asserted via toBeCloseTo precision 9 here since the
 * arithmetic is exact; the tolerance is the contractual display-side allowance).
 *
 * Oats:    per 100g {cal 389, p 16.9, c 66.3, f 6.9, fib 10.6, micros {iron 4.7mg}},
 *          150 g -> factor 1.5
 *   -> {cal 583.5, p 25.35, c 99.45, f 10.35, fib 15.9, iron 7.05mg}
 * Milk:    per 100g {cal 42, p 3.4, c 5, f 1, fib 0, micros {calcium 125mg}},
 *          2 cup @ 244g -> 488 g -> factor 4.88
 *   -> {cal 204.96, p 16.592, c 24.4, f 4.88, fib 0, calcium 610mg}
 * Egg:     per 100g {cal 143, p 12.6, c 0.7, f 9.5, fib 0, micros {} EMPTY},
 *          2 qty @ 50g -> 100 g -> factor 1   (missing-micronutrients)
 *   -> {cal 143, p 12.6, c 0.7, f 9.5, fib 0}
 * Total -> {cal 931.46, p 54.542, c 124.55, f 24.73, fib 15.9}
 *          micros union {iron 7.05mg, calcium 610mg}
 * PerServing (2) -> {cal 465.73, p 27.271, c 62.275, f 12.365, fib 7.95}
 *          micros {iron 3.525mg, calcium 305mg}
 */
const verifyRecipe: NutritionLine[] = [
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
    quantity: 2,
    unitCode: 'qty',
    ingredient: {
      id: 'egg',
      referenceGrams: 100,
      gramEquivalents: {},
      gramWeightPerQty: 50,
      nutrition: {
        calories: 143,
        proteinG: 12.6,
        carbsG: 0.7,
        fatG: 9.5,
        fiberG: 0,
        micronutrients: {},
      },
    },
  },
];

describe('computeRecipeNutrition - Bundle Verify', () => {
  it('matches hand-verified macro totals within tolerance (+/-1 kcal, +/-0.5 g)', () => {
    const { total } = computeRecipeNutrition(verifyRecipe, 2);
    expect(Math.abs(total.calories - 931.46)).toBeLessThanOrEqual(1);
    expect(Math.abs(total.proteinG - 54.542)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(total.carbsG - 124.55)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(total.fatG - 24.73)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(total.fiberG - 15.9)).toBeLessThanOrEqual(0.5);
  });

  it('matches hand-verified per-serving (total / 2) within tolerance', () => {
    const { perServing } = computeRecipeNutrition(verifyRecipe, 2);
    expect(Math.abs(perServing.calories - 465.73)).toBeLessThanOrEqual(1);
    expect(Math.abs(perServing.proteinG - 27.271)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(perServing.carbsG - 62.275)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(perServing.fatG - 12.365)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(perServing.fiberG - 7.95)).toBeLessThanOrEqual(0.5);
  });

  it('sums micronutrients as a union across ingredients', () => {
    const { total, perServing } = computeRecipeNutrition(verifyRecipe, 2);
    expect(total.micronutrients.iron?.amount).toBeCloseTo(7.05, 9);
    expect(total.micronutrients.iron?.unit).toBe('mg');
    expect(total.micronutrients.calcium?.amount).toBeCloseTo(610, 9);
    expect(total.micronutrients.calcium?.unit).toBe('mg');
    expect(perServing.micronutrients.iron?.amount).toBeCloseTo(3.525, 9);
    expect(perServing.micronutrients.calcium?.amount).toBeCloseTo(305, 9);
  });

  it('flags the missing-micronutrient ingredient while still counting its macros', () => {
    const { total, completeness } = computeRecipeNutrition(verifyRecipe, 2);
    expect(completeness.complete).toBe(false);
    const egg = completeness.missing.find((g) => g.ingredientId === 'egg');
    expect(egg?.reason).toBe('missing-micronutrients');
    // egg macros ARE counted: drop egg's 143 kcal and the total would be 788.46
    expect(total.calories).toBeGreaterThan(900);
  });
});
