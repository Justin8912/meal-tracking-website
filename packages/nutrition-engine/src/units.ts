/**
 * Unit-to-grams conversion (STEP-9, AD-4, AC-4.5).
 *
 * This is where conversion accuracy lives. Mass (`g`) passes straight through;
 * count (`qty`) uses the ingredient's own usual weight; every other unit is
 * treated as a per-ingredient gram-equivalent lookup. There is deliberately NO
 * global unit table: fixed volume factors are ~2x wrong for some foods (F-4) —
 * a cup of flour (~125g) is not a cup of water (~236g).
 *
 * When the data needed for a conversion is absent, the function returns a
 * discriminated `{ resolved: false, reason }` rather than substituting a
 * default. A silent default would corrupt totals; the caller records the gap
 * in the completeness descriptor instead (STEP-15, S-6).
 *
 * Pure: no I/O, no Date, no randomness (S-1).
 */
import type { GramResult, NutritionIngredient } from './types.js';

/** The mass unit code that needs no conversion. */
const GRAM_UNIT = 'g';
/** The count unit code resolved via the ingredient's usual weight. */
const QTY_UNIT = 'qty';
/** Ounce is a universal weight unit — 1 oz = 28.3495 g regardless of ingredient. */
const OZ_UNIT = 'oz';
const OZ_TO_GRAMS = 28.3495;

/**
 * Resolve a usage `(quantity, unitCode)` to grams for a specific ingredient.
 *
 * - `g`   -> the quantity is already grams.
 * - `oz`  -> quantity × 28.3495, unless the ingredient has a per-ingredient
 *            override in gramEquivalents (supports the virtual-gram model used
 *            by custom ingredients). The universal fallback means USDA
 *            ingredients work with oz without a stored gram-equivalent.
 * - `qty` -> quantity × ingredient.gramWeightPerQty (flagged if unknown).
 * - otherwise -> quantity × ingredient.gramEquivalents[unitCode] (flagged if
 *   this ingredient has no gram-equivalent for that unit).
 */
export function toGrams(
  quantity: number,
  unitCode: string,
  ingredient: NutritionIngredient,
): GramResult {
  if (unitCode === GRAM_UNIT) {
    return { resolved: true, grams: quantity };
  }

  if (unitCode === OZ_UNIT) {
    const override = ingredient.gramEquivalents[OZ_UNIT];
    return { resolved: true, grams: quantity * (override ?? OZ_TO_GRAMS) };
  }

  if (unitCode === QTY_UNIT) {
    const perQty = ingredient.gramWeightPerQty;
    if (perQty === null || perQty === undefined) {
      return {
        resolved: false,
        reason: `no usual weight (gramWeightPerQty) for qty of "${ingredient.id}"`,
      };
    }
    return { resolved: true, grams: quantity * perQty };
  }

  const gramsPerUnit = ingredient.gramEquivalents[unitCode];
  if (gramsPerUnit === undefined) {
    return {
      resolved: false,
      reason: `no gram-equivalent for unit "${unitCode}" on ingredient "${ingredient.id}"`,
    };
  }
  return { resolved: true, grams: quantity * gramsPerUnit };
}
