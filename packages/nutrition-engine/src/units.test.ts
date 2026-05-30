import { describe, it, expect } from 'vitest';
import { toGrams } from './units.js';
import type { NutritionIngredient } from './types.js';

/**
 * STEP-8 (test-first for STEP-9): unit-to-grams conversion.
 *
 * Volume conversion is the #1 accuracy risk (F-4): a cup of flour is ~125g, a
 * cup of water ~236g. These tests assert PER-INGREDIENT gram-equivalents (the
 * same unit yields different grams across ingredients), that mass units pass
 * through unchanged, that `qty` uses the ingredient's usual weight, and that
 * missing conversion data returns a flagged result rather than a guess. A test
 * that only checked `g` would miss the density bug entirely.
 */

const emptyNutrition = {
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
  micronutrients: {},
};

const flour: NutritionIngredient = {
  id: 'flour',
  nutrition: emptyNutrition,
  referenceGrams: 100,
  gramEquivalents: { cup: 125 },
  gramWeightPerQty: null,
};

const water: NutritionIngredient = {
  id: 'water',
  nutrition: emptyNutrition,
  referenceGrams: 100,
  gramEquivalents: { cup: 236 },
  gramWeightPerQty: null,
};

const egg: NutritionIngredient = {
  id: 'egg',
  nutrition: emptyNutrition,
  referenceGrams: 100,
  gramEquivalents: {},
  gramWeightPerQty: 50,
};

describe('toGrams', () => {
  it('passes grams through unchanged regardless of ingredient', () => {
    const r = toGrams(250, 'g', flour);
    expect(r).toEqual({ resolved: true, grams: 250 });
  });

  it('uses the ingredient OWN per-unit gram-equivalent for volume units', () => {
    const flourCup = toGrams(1, 'cup', flour);
    const waterCup = toGrams(1, 'cup', water);
    expect(flourCup).toEqual({ resolved: true, grams: 125 });
    expect(waterCup).toEqual({ resolved: true, grams: 236 });
    // The same unit must NOT resolve to the same grams across ingredients
    // (this is the F-4 density bug guard, not a global table).
    expect(flourCup).not.toEqual(waterCup);
  });

  it('scales volume gram-equivalent by quantity', () => {
    expect(toGrams(2, 'cup', flour)).toEqual({ resolved: true, grams: 250 });
  });

  it('uses the ingredient usual-weight (gramWeightPerQty) for qty', () => {
    expect(toGrams(3, 'qty', egg)).toEqual({ resolved: true, grams: 150 });
  });

  it('flags a missing volume gram-equivalent instead of guessing', () => {
    const r = toGrams(1, 'cup', egg);
    expect(r.resolved).toBe(false);
    if (!r.resolved) {
      expect(r.reason).toMatch(/cup/);
    }
  });

  it('flags a missing usual-weight for qty instead of guessing', () => {
    const r = toGrams(1, 'qty', flour);
    expect(r.resolved).toBe(false);
    if (!r.resolved) {
      expect(r.reason).toMatch(/qty|weight/i);
    }
  });
});
