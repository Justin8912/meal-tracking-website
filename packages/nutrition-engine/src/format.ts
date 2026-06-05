/**
 * Display formatting — the single rounding boundary (STEP-17, AD-1, S-6).
 *
 * Computation everywhere else stays full precision; rounding mid-sum compounds
 * error across ingredients and weeks (F-5). This module isolates ALL rounding
 * so the web UI and any API serialization round through one place rather than
 * ad hoc at each call site. It never mutates its input and never zero-fills
 * absent micronutrients — it only rounds what is present.
 *
 * Rounding policy:
 * - calories: integer (kcal is shown whole).
 * - macros (g): one decimal place.
 * - micronutrients: mcg to an integer (microgram precision below 1 is noise);
 *   mg and any other unit to one decimal as a sensible default.
 *
 * Pure: no I/O, no Date, no randomness (S-1).
 */
import type { FormattedNutrition, Micronutrient, Nutrition } from './types.js';

/** Round to a fixed number of decimal places, avoiding -0 and trailing noise. */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  // +0 normalizes -0; Number() trims any IEEE-754 representation tail.
  return Number((Math.round(value * factor) / factor).toFixed(decimals)) + 0;
}

/** Round one micronutrient by its unit: mcg -> integer, else one decimal. */
function formatMicronutrient(micro: Micronutrient): Micronutrient {
  const decimals = micro.unit === 'mcg' ? 0 : 1;
  return { amount: roundTo(micro.amount, decimals), unit: micro.unit };
}

/**
 * Produce a display-rounded copy of a full-precision nutrition profile.
 *
 * Returns a NEW `FormattedNutrition` (with a new micronutrient map); the input
 * is never mutated, so the source result remains full precision for further
 * computation (S-6).
 */
export function formatNutrition(nutrition: Nutrition): FormattedNutrition {
  const micronutrients: Record<string, Micronutrient> = {};
  for (const [name, micro] of Object.entries(nutrition.micronutrients)) {
    micronutrients[name] = formatMicronutrient(micro);
  }

  return {
    calories: roundTo(nutrition.calories, 0),
    proteinG: roundTo(nutrition.proteinG, 1),
    carbsG: roundTo(nutrition.carbsG, 1),
    fatG: roundTo(nutrition.fatG, 1),
    fiberG: roundTo(nutrition.fiberG, 1),
    micronutrients,
  };
}
