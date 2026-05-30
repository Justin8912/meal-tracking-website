import { describe, it, expect } from 'vitest';
import { formatNutrition } from './format.js';
import type { Nutrition } from './types.js';

/**
 * STEP-16 (test-first for STEP-17): display rounding (S-6).
 *
 * Rounding happens ONLY at the display boundary. The formatter rounds for
 * display (integer kcal, one-decimal grams, sensible mg/mcg) while the source
 * result stays full precision; it must not mutate its input. Summing displayed
 * (rounded) values is never how totals are produced — this formatter is the
 * single rounding point, guarding against reintroducing compounding error.
 */
const fullPrecision: Nutrition = {
  calories: 663.7499,
  proteinG: 46.2516,
  carbsG: 99.96,
  fatG: 6.249,
  fiberG: 3.04,
  micronutrients: {
    iron: { amount: 3.5251, unit: 'mg' },
    folate: { amount: 40.6, unit: 'mcg' },
  },
};

describe('formatNutrition', () => {
  it('rounds calories to an integer', () => {
    const out = formatNutrition(fullPrecision);
    expect(out.calories).toBe(664);
  });

  it('rounds macros to one decimal place', () => {
    const out = formatNutrition(fullPrecision);
    expect(out.proteinG).toBe(46.3);
    expect(out.carbsG).toBe(100);
    expect(out.fatG).toBe(6.2);
    expect(out.fiberG).toBe(3);
  });

  it('rounds mg micronutrients to one decimal and mcg to an integer', () => {
    const out = formatNutrition(fullPrecision);
    expect(out.micronutrients.iron).toEqual({ amount: 3.5, unit: 'mg' });
    expect(out.micronutrients.folate).toEqual({ amount: 41, unit: 'mcg' });
  });

  it('does not mutate the input (source stays full precision)', () => {
    const snapshot = JSON.parse(JSON.stringify(fullPrecision));
    formatNutrition(fullPrecision);
    expect(fullPrecision).toEqual(snapshot);
    // the returned object is a distinct value, not the same reference
    const out = formatNutrition(fullPrecision);
    expect(out).not.toBe(fullPrecision);
    expect(out.micronutrients).not.toBe(fullPrecision.micronutrients);
  });

  it('preserves the micronutrient unit and keys (no zero-fill)', () => {
    const out = formatNutrition(fullPrecision);
    expect(Object.keys(out.micronutrients).sort()).toEqual(['folate', 'iron']);
    expect(out.micronutrients.iron?.unit).toBe('mg');
    expect(out.micronutrients.folate?.unit).toBe('mcg');
  });

  it('rounds an unknown micronutrient unit to one decimal as a sensible default', () => {
    const odd: Nutrition = {
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      micronutrients: { potassium: { amount: 4321.678, unit: 'IU' } },
    };
    const out = formatNutrition(odd);
    expect(out.micronutrients.potassium).toEqual({ amount: 4321.7, unit: 'IU' });
  });
});
