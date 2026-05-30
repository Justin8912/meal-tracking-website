import { describe, it, expect } from 'vitest';
import {
  mapSearchFood,
  mapDetailFood,
  type NormalizedFood,
} from './mapper.js';

/**
 * STEP-18 test-first for the USDA nutrient-number mapper (STEP-19).
 *
 * The two USDA endpoints return DIFFERENT nutrient shapes (F-7):
 *  - /foods/search items carry FLAT nutrient fields: `nutrientNumber` + `value`.
 *  - /food/{fdcId} NESTS the nutrient under `nutrient.number` + `amount`.
 *
 * Both must map by stable nutrient NUMBER (Energy 208, Protein 203, Fat 204,
 * Carbs 205, Fiber 291) to ONE normalized per-100g model. A nutrient that is
 * absent in the payload must be OMITTED from the result (never zero - F-8/S-6).
 *
 * These tests fail before STEP-19 (mapper not implemented).
 */

// A /foods/search item: flat nutrientNumber/value (string numbers as USDA sends).
const SEARCH_ITEM = {
  fdcId: 171705,
  description: 'Chicken, broilers or fryers, breast, meat only, raw',
  dataType: 'SR Legacy',
  foodNutrients: [
    { nutrientNumber: '208', nutrientName: 'Energy', value: 120, unitName: 'KCAL' },
    { nutrientNumber: '203', nutrientName: 'Protein', value: 22.5, unitName: 'G' },
    { nutrientNumber: '204', nutrientName: 'Total lipid (fat)', value: 2.62, unitName: 'G' },
    { nutrientNumber: '205', nutrientName: 'Carbohydrate, by difference', value: 0, unitName: 'G' },
    { nutrientNumber: '291', nutrientName: 'Fiber, total dietary', value: 0, unitName: 'G' },
    { nutrientNumber: '301', nutrientName: 'Calcium, Ca', value: 5, unitName: 'MG' },
    { nutrientNumber: '303', nutrientName: 'Iron, Fe', value: 0.37, unitName: 'MG' },
  ],
};

// The SAME food via /food/{fdcId}: nested nutrient.number/amount.
const DETAIL_ITEM = {
  fdcId: 171705,
  description: 'Chicken, broilers or fryers, breast, meat only, raw',
  dataType: 'SR Legacy',
  foodNutrients: [
    { nutrient: { number: '208', name: 'Energy', unitName: 'kcal' }, amount: 120 },
    { nutrient: { number: '203', name: 'Protein', unitName: 'g' }, amount: 22.5 },
    { nutrient: { number: '204', name: 'Total lipid (fat)', unitName: 'g' }, amount: 2.62 },
    { nutrient: { number: '205', name: 'Carbohydrate, by difference', unitName: 'g' }, amount: 0 },
    { nutrient: { number: '291', name: 'Fiber, total dietary', unitName: 'g' }, amount: 0 },
    { nutrient: { number: '301', name: 'Calcium, Ca', unitName: 'mg' }, amount: 5 },
    { nutrient: { number: '303', name: 'Iron, Fe', unitName: 'mg' }, amount: 0.37 },
  ],
};

// A branded item MISSING fat/fiber entirely - those must be omitted, not zeroed.
const SEARCH_ITEM_SPARSE = {
  fdcId: 999000,
  description: 'Mystery Branded Bar',
  dataType: 'Branded',
  foodNutrients: [
    { nutrientNumber: '208', nutrientName: 'Energy', value: 250, unitName: 'KCAL' },
    { nutrientNumber: '203', nutrientName: 'Protein', value: 10, unitName: 'G' },
    // no 204 (fat), no 205 (carbs), no 291 (fiber)
  ],
};

describe('USDA nutrient-number mapper (unit)', () => {
  it('maps the FLAT search shape by nutrient number to per-100g macros', () => {
    const out: NormalizedFood = mapSearchFood(SEARCH_ITEM);
    expect(out.fdcId).toBe('171705');
    expect(out.description).toBe(SEARCH_ITEM.description);
    expect(out.dataType).toBe('SR Legacy');
    expect(out.per100g.calories).toBe(120);
    expect(out.per100g.proteinG).toBe(22.5);
    expect(out.per100g.fatG).toBe(2.62);
    expect(out.per100g.carbsG).toBe(0);
    expect(out.per100g.fiberG).toBe(0);
    expect(out.per100g.micronutrients.Calcium).toEqual({ amount: 5, unit: 'mg' });
    expect(out.per100g.micronutrients.Iron).toEqual({ amount: 0.37, unit: 'mg' });
  });

  it('maps the NESTED detail shape to the identical per-100g macros', () => {
    const fromSearch = mapSearchFood(SEARCH_ITEM);
    const fromDetail = mapDetailFood(DETAIL_ITEM);
    expect(fromDetail.per100g.calories).toBe(fromSearch.per100g.calories);
    expect(fromDetail.per100g.proteinG).toBe(fromSearch.per100g.proteinG);
    expect(fromDetail.per100g.fatG).toBe(fromSearch.per100g.fatG);
    expect(fromDetail.per100g.carbsG).toBe(fromSearch.per100g.carbsG);
    expect(fromDetail.per100g.fiberG).toBe(fromSearch.per100g.fiberG);
    expect(fromDetail.per100g.micronutrients.Calcium).toEqual({
      amount: 5,
      unit: 'mg',
    });
  });

  it('OMITS missing nutrients (does not zero-fill them - F-8/S-6)', () => {
    const out = mapSearchFood(SEARCH_ITEM_SPARSE);
    expect(out.per100g.calories).toBe(250);
    expect(out.per100g.proteinG).toBe(10);
    // absent in the payload -> absent in the result (NOT 0)
    expect(out.per100g.fatG).toBeUndefined();
    expect(out.per100g.carbsG).toBeUndefined();
    expect(out.per100g.fiberG).toBeUndefined();
    expect('fatG' in out.per100g).toBe(false);
  });
});
