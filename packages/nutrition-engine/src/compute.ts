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
  CompletenessGap,
  Micronutrient,
  Nutrition,
  NutritionLine,
  RecipeNutrition,
} from './types.js';

/**
 * Reason recorded when `toGrams` cannot resolve grams for a line. The line is
 * EXCLUDED from both macro and micronutrient sums (its contribution genuinely
 * cannot be computed) and surfaced via completeness, never zero-filled (F-5).
 */
const REASON_UNRESOLVED_GRAMS = 'unresolved-grams';
/**
 * Reason recorded when a line resolves to grams but carries an empty
 * micronutrient map. Its macros (and any micros it does have) STILL contribute
 * to the sums; we simply never fabricate the absent micronutrients (S-6). The
 * recipe is flagged incomplete so the UI can surface the gap.
 */
const REASON_MISSING_MICRONUTRIENTS = 'missing-micronutrients';

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

/**
 * Accumulate an ingredient's micronutrients into `acc` as an absolute-mass
 * keyed union (STEP-13, AD-1, AC-4.2), scaling each amount by `factor`
 * (grams / referenceGrams). Overlapping keys sum; disjoint keys coexist. Mass
 * (mg/mcg) sums correctly across ingredients — values are never %DV. The unit
 * is taken from the first contributor of a key (a normalized snapshot uses one
 * unit per nutrient); absent keys contribute nothing (handled by completeness,
 * STEP-15, never zero-filled).
 */
function addMicronutrients(
  acc: Record<string, Micronutrient>,
  source: Record<string, Micronutrient>,
  factor: number,
): void {
  for (const [name, micro] of Object.entries(source)) {
    const existing = acc[name];
    if (existing === undefined) {
      acc[name] = { amount: micro.amount * factor, unit: micro.unit };
    } else {
      existing.amount += micro.amount * factor;
    }
  }
}

/** Divide a micronutrient union by `divisor` into a new map. */
function divideMicronutrients(
  source: Record<string, Micronutrient>,
  divisor: number,
): Record<string, Micronutrient> {
  const out: Record<string, Micronutrient> = {};
  for (const [name, micro] of Object.entries(source)) {
    out[name] = { amount: micro.amount / divisor, unit: micro.unit };
  }
  return out;
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
 * completeness descriptor (STEP-15) extend this function. Completeness has two
 * distinct gaps: an unresolved-grams line is excluded from sums; a line with an
 * empty micronutrient map still contributes its macros but is flagged
 * missing-micronutrients. Absent data is never zero-filled (F-5, S-6).
 */
export function computeRecipeNutrition(
  lines: NutritionLine[],
  servings: number,
): RecipeNutrition {
  const total = emptyTotal();
  const missing: CompletenessGap[] = [];

  for (const line of lines) {
    const gramResult = toGrams(line.quantity, line.unitCode, line.ingredient);
    if (!gramResult.resolved) {
      // Grams unresolved: the line's contribution cannot be computed, so it is
      // excluded from BOTH sums and recorded; never substitute a default
      // weight (F-5, S-6). The unit is surfaced via the toGrams reason.
      missing.push({
        ingredientId: line.ingredient.id,
        reason: `${REASON_UNRESOLVED_GRAMS}: ${gramResult.reason}`,
      });
      continue;
    }
    const factor = gramResult.grams / line.ingredient.referenceGrams;
    // Macros (and any present micronutrients) always contribute once grams
    // resolve, even if the micronutrient map is empty.
    addMacros(total, scaleMacros(line.ingredient.nutrition, factor));
    addMicronutrients(
      total.micronutrients,
      line.ingredient.nutrition.micronutrients,
      factor,
    );
    // An empty micronutrient map is a partial-data gap: macros are counted but
    // the absent micronutrients are never zero-filled, so flag the recipe.
    if (Object.keys(line.ingredient.nutrition.micronutrients).length === 0) {
      missing.push({
        ingredientId: line.ingredient.id,
        reason: REASON_MISSING_MICRONUTRIENTS,
      });
    }
  }

  const divisor = Math.max(servings, 1);
  const perServing = divideMacros(total, divisor);
  perServing.micronutrients = divideMicronutrients(
    total.micronutrients,
    divisor,
  );

  return {
    total,
    perServing,
    completeness: { complete: missing.length === 0, missing },
  };
}
