import { describe, it, expect } from 'vitest';
import { computeRecipeNutrition } from './compute.js';
import type { NutritionLine } from './types.js';

/**
 * Tolerance for hand-verified floating-point comparisons. Computation is
 * full-precision (rounding is display-only, S-6); this tolerance only absorbs
 * IEEE-754 representation error in sums/divisions, not any deliberate rounding.
 * 1e-9 is far tighter than any display rounding (integers / one decimal) yet
 * comfortably above accumulated float error for recipe-scale arithmetic.
 */
const TOLERANCE = 1e-9;

/**
 * STEP-10 (test-first for STEP-11): macro scaling and per-serving.
 *
 * A 2-ingredient, 2-serving recipe with a mass line and a volume line
 * (per-ingredient cup gram-equivalent). Each macro scales as
 * per-referenceGrams * grams / referenceGrams; macros sum across ingredients;
 * per-serving = total / servings in full precision. Hand-verified below.
 *
 * Chicken: per 100g {cal 165, p 31, c 0, f 3.6, fib 0}, used 250 g  -> x2.5
 *   -> {cal 412.5, p 77.5, c 0, f 9, fib 0}
 * Rice flour: per 100g {cal 366, p 6, c 80, f 1.4, fib 2.4}, 2 cup @125g -> 250g x2.5
 *   -> {cal 915, p 15, c 200, f 3.5, fib 6}
 * Total      -> {cal 1327.5, p 92.5, c 200, f 12.5, fib 6}
 * PerServing -> {cal 663.75, p 46.25, c 100, f 6.25, fib 3}
 */
const lines: NutritionLine[] = [
  {
    quantity: 250,
    unitCode: 'g',
    ingredient: {
      id: 'chicken',
      referenceGrams: 100,
      gramEquivalents: {},
      gramWeightPerQty: null,
      nutrition: {
        calories: 165,
        proteinG: 31,
        carbsG: 0,
        fatG: 3.6,
        fiberG: 0,
        micronutrients: {},
      },
    },
  },
  {
    quantity: 2,
    unitCode: 'cup',
    ingredient: {
      id: 'rice-flour',
      referenceGrams: 100,
      gramEquivalents: { cup: 125 },
      gramWeightPerQty: null,
      nutrition: {
        calories: 366,
        proteinG: 6,
        carbsG: 80,
        fatG: 1.4,
        fiberG: 2.4,
        micronutrients: {},
      },
    },
  },
];

describe('computeRecipeNutrition - macros', () => {
  it('sums macros scaled by grams across ingredients', () => {
    const { total } = computeRecipeNutrition(lines, 2);
    expect(total.calories).toBeCloseTo(1327.5, 9);
    expect(total.proteinG).toBeCloseTo(92.5, 9);
    expect(total.carbsG).toBeCloseTo(200, 9);
    expect(total.fatG).toBeCloseTo(12.5, 9);
    expect(total.fiberG).toBeCloseTo(6, 9);
  });

  it('divides per-serving by servings in full precision', () => {
    const { total, perServing } = computeRecipeNutrition(lines, 2);
    expect(perServing.calories).toBeCloseTo(663.75, 9);
    expect(perServing.proteinG).toBeCloseTo(46.25, 9);
    expect(perServing.carbsG).toBeCloseTo(100, 9);
    expect(perServing.fatG).toBeCloseTo(6.25, 9);
    expect(perServing.fiberG).toBeCloseTo(3, 9);
    // per-serving is exactly total/servings, not a re-rounded recomputation
    expect(Math.abs(perServing.calories - total.calories / 2)).toBeLessThan(
      TOLERANCE,
    );
  });

  it('treats servings < 1 as 1 (max(servings,1)) so per-serving = total', () => {
    const { total, perServing } = computeRecipeNutrition(lines, 0);
    expect(perServing.calories).toBeCloseTo(total.calories, 9);
  });

  it('does not round mid-calculation (retains full precision)', () => {
    // A line that produces a repeating-decimal gram factor: 1 g of an
    // ingredient whose calories is 1 -> 1/100 = 0.01 per gram. 333 g -> 3.33.
    const repeating: NutritionLine[] = [
      {
        quantity: 333,
        unitCode: 'g',
        ingredient: {
          id: 'x',
          referenceGrams: 100,
          gramEquivalents: {},
          gramWeightPerQty: null,
          nutrition: {
            calories: 1,
            proteinG: 0,
            carbsG: 0,
            fatG: 0,
            fiberG: 0,
            micronutrients: {},
          },
        },
      },
    ];
    const { total } = computeRecipeNutrition(repeating, 3);
    // 333 * 1 / 100 = 3.33 exactly (not rounded to 3)
    expect(total.calories).toBeCloseTo(3.33, 9);
  });
});
