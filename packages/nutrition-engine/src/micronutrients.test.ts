import { describe, it, expect } from 'vitest';
import { computeRecipeNutrition } from './compute.js';
import type { NutritionLine } from './types.js';

/**
 * STEP-12 (test-first for STEP-13): micronutrient absolute-mass union.
 *
 * Ingredients carry different micronutrient sets. Aggregation is a keyed union
 * over nutrient name: overlapping keys SUM (scaled by grams), disjoint keys
 * coexist. A naive merge that overwrites instead of summing would pass a
 * single-ingredient test but fail here. Micronutrients are absolute mass
 * (mg/mcg), not %DV.
 *
 * Ing A: per 100g {iron 2mg, vitC 10mg}, used 100 g -> factor 1
 *   -> {iron 2mg, vitC 10mg}
 * Ing B: per 100g {iron 1mg, calcium 50mg}, used 200 g -> factor 2
 *   -> {iron 2mg, calcium 100mg}
 * Union total -> {iron 4mg, vitC 10mg, calcium 100mg}
 * Per serving (2) -> {iron 2mg, vitC 5mg, calcium 50mg}
 */
const lines: NutritionLine[] = [
  {
    quantity: 100,
    unitCode: 'g',
    ingredient: {
      id: 'a',
      referenceGrams: 100,
      gramEquivalents: {},
      gramWeightPerQty: null,
      nutrition: {
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        fiberG: 0,
        micronutrients: {
          iron: { amount: 2, unit: 'mg' },
          vitC: { amount: 10, unit: 'mg' },
        },
      },
    },
  },
  {
    quantity: 200,
    unitCode: 'g',
    ingredient: {
      id: 'b',
      referenceGrams: 100,
      gramEquivalents: {},
      gramWeightPerQty: null,
      nutrition: {
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        fiberG: 0,
        micronutrients: {
          iron: { amount: 1, unit: 'mg' },
          calcium: { amount: 50, unit: 'mg' },
        },
      },
    },
  },
];

describe('computeRecipeNutrition - micronutrient union', () => {
  it('sums overlapping keys scaled by grams', () => {
    const { total } = computeRecipeNutrition(lines, 2);
    expect(total.micronutrients.iron).toEqual({ amount: 4, unit: 'mg' });
  });

  it('keeps disjoint keys coexisting', () => {
    const { total } = computeRecipeNutrition(lines, 2);
    expect(total.micronutrients.vitC).toEqual({ amount: 10, unit: 'mg' });
    expect(total.micronutrients.calcium).toEqual({ amount: 100, unit: 'mg' });
    expect(Object.keys(total.micronutrients).sort()).toEqual([
      'calcium',
      'iron',
      'vitC',
    ]);
  });

  it('divides the micronutrient union per serving', () => {
    const { perServing } = computeRecipeNutrition(lines, 2);
    expect(perServing.micronutrients.iron).toEqual({ amount: 2, unit: 'mg' });
    expect(perServing.micronutrients.vitC).toEqual({ amount: 5, unit: 'mg' });
    expect(perServing.micronutrients.calcium).toEqual({
      amount: 50,
      unit: 'mg',
    });
  });

  it('preserves the per-nutrient unit (mg/mcg), not coerced to %DV', () => {
    const mixedUnits: NutritionLine[] = [
      {
        quantity: 100,
        unitCode: 'g',
        ingredient: {
          id: 'c',
          referenceGrams: 100,
          gramEquivalents: {},
          gramWeightPerQty: null,
          nutrition: {
            calories: 0,
            proteinG: 0,
            carbsG: 0,
            fatG: 0,
            fiberG: 0,
            micronutrients: {
              folate: { amount: 40, unit: 'mcg' },
              sodium: { amount: 5, unit: 'mg' },
            },
          },
        },
      },
    ];
    const { total } = computeRecipeNutrition(mixedUnits, 1);
    expect(total.micronutrients.folate?.unit).toBe('mcg');
    expect(total.micronutrients.sodium?.unit).toBe('mg');
  });
});
