/**
 * Recipe nutrition accumulation (STEP-11, AD-1, AC-4.1/4.3).
 *
 * The accuracy core. Each ingredient line is resolved to grams (units.ts),
 * then its per-`referenceGrams` macros are scaled by `grams / referenceGrams`
 * and summed across the recipe in full float precision. Per-serving is
 * `total / max(servings, 1)`. NOTHING is rounded here — rounding is a display
 * concern (format.ts, S-6); rounding mid-sum compounds error across
 * ingredients (F-5).
 *
 * Pure: no I/O, no Date, no randomness (S-1).
 */
import { toGrams } from './units.js';
import type {
  Nutrition,
  NutritionLine,
  RecipeNutrition,
} from './types.js';

/** A zeroed macro accumulator with an empty micronutrient union. */
function emptyTotal(): Nutrition {
  return {
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    micronutrients: {},
  };
}

/** Scale every macro of `n` by `factor` (grams / referenceGrams). */
function scaleMacros(n: Nutrition, factor: number): Nutrition {
  return {
    calories: n.calories * factor,
    proteinG: n.proteinG * factor,
    carbsG: n.carbsG * factor,
    fatG: n.fatG * factor,
    fiberG: n.fiberG * factor,
    micronutrients: {},
  };
}

/** Add the macros of `add` into `acc` in place. */
function addMacros(acc: Nutrition, add: Nutrition): void {
  acc.calories += add.calories;
  acc.proteinG += add.proteinG;
  acc.carbsG += add.carbsG;
  acc.fatG += add.fatG;
  acc.fiberG += add.fiberG;
}

/** Divide every macro of `n` by `divisor` into a new Nutrition. */
function divideMacros(n: Nutrition, divisor: number): Nutrition {
  return {
    calories: n.calories / divisor,
    proteinG: n.proteinG / divisor,
    carbsG: n.carbsG / divisor,
    fatG: n.fatG / divisor,
    fiberG: n.fiberG / divisor,
    micronutrients: {},
  };
}

/**
 * Compute total and per-serving nutrition for a recipe.
 *
 * STEP-11 establishes the macro path; the micronutrient union (STEP-13) and
 * completeness descriptor (STEP-15) extend this function.
 */
export function computeRecipeNutrition(
  lines: NutritionLine[],
  servings: number,
): RecipeNutrition {
  const total = emptyTotal();

  for (const line of lines) {
    const gramResult = toGrams(line.quantity, line.unitCode, line.ingredient);
    if (!gramResult.resolved) {
      // Unresolved grams are recorded in completeness (STEP-15), never summed.
      continue;
    }
    const factor = gramResult.grams / line.ingredient.referenceGrams;
    addMacros(total, scaleMacros(line.ingredient.nutrition, factor));
  }

  const divisor = Math.max(servings, 1);
  const perServing = divideMacros(total, divisor);

  return {
    total,
    perServing,
    completeness: { complete: true, missing: [] },
  };
}
