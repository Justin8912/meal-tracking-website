/**
 * Public barrel for the pure, dependency-free nutrition engine (AD-1, S-1).
 *
 * The engine performs per-`referenceGrams` scaling, full-precision macro and
 * absolute-mass micronutrient accumulation, a completeness descriptor for
 * missing data (never zero-filled — F-5/S-6), and display-only rounding. It is
 * imported by both the API (authoritative totals) and the web client (live
 * recalc, AC-4.4) with zero runtime dependencies.
 */
export { toGrams } from './units.js';
export { computeRecipeNutrition } from './compute.js';
export { formatNutrition } from './format.js';
export type {
  Nutrition,
  Micronutrient,
  NutritionIngredient,
  NutritionLine,
  GramResult,
  CompletenessGap,
  Completeness,
  RecipeNutrition,
  FormattedNutrition,
} from './types.js';
