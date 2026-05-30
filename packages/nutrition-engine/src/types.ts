/**
 * Input contract for the pure nutrition engine (AD-1, AD-4).
 *
 * The engine consumes ingredient lines that pair a usage (quantity + unit)
 * with the ingredient's snapshotted per-`referenceGrams` nutrition AND its
 * per-ingredient conversion data. Conversion data is carried on the ingredient
 * itself, not a global table, because fixed volume factors are ~2x wrong for
 * some foods (F-4): a cup of flour is not a cup of water.
 *
 * Macro/micronutrient shapes are reused from `@meal-tracking/shared` so the
 * engine and the API contract cannot drift (S-3). These are type-only imports;
 * the engine carries no runtime dependency (S-1).
 */
import type { Nutrition, Micronutrient } from '@meal-tracking/shared';

export type { Nutrition, Micronutrient };

/**
 * Per-ingredient conversion data plus the nutrition snapshot the engine scales.
 *
 * - `referenceGrams`: the gram basis the stored `nutrition` is measured against
 *   (default 100). Scaling is `nutrition * grams / referenceGrams`.
 * - `gramEquivalents`: grams that one of a given volume/other unit represents
 *   FOR THIS ingredient, keyed by unit code (e.g. `{ cup: 125 }` for flour,
 *   `{ cup: 236 }` for water). Absent keys mean the engine cannot resolve that
 *   unit and must flag it via completeness rather than guess (F-4, AD-4).
 * - `gramWeightPerQty`: grams one count (`qty`) of this ingredient weighs
 *   (its usual weight). `null` when unknown.
 */
export interface NutritionIngredient {
  /** Stable id used to flag the line in the completeness descriptor. */
  id: string;
  /** Per-`referenceGrams` nutrition snapshot. */
  nutrition: Nutrition;
  /** Gram basis the stored nutrition is measured against (default 100). */
  referenceGrams: number;
  /** Per-unit gram-equivalents for non-mass units, keyed by unit code. */
  gramEquivalents: Record<string, number>;
  /** Grams one `qty` (count) of this ingredient weighs; null if unknown. */
  gramWeightPerQty: number | null;
}

/**
 * A recipe line as the engine sees it: a usage paired with the ingredient.
 * Mirrors `RecipeIngredient` (quantity + unitCode) resolved against its
 * ingredient so the engine stays pure (no lookups, no I/O — S-1).
 */
export interface NutritionLine {
  quantity: number;
  unitCode: string;
  ingredient: NutritionIngredient;
}

/**
 * Result of resolving a usage to grams. Discriminated so a caller can never
 * mistake an unresolved conversion for zero grams (F-5, S-6): missing data is
 * surfaced, never silently defaulted.
 */
export type GramResult =
  | { resolved: true; grams: number }
  | { resolved: false; reason: string };

/** One flagged ingredient line in the completeness descriptor. */
export interface CompletenessGap {
  ingredientId: string;
  reason: string;
}

/**
 * Whether every line contributed to the totals. `complete` is true only when
 * nothing was flagged; flagged lines are EXCLUDED from sums, never zero-filled
 * (F-5, S-6).
 */
export interface Completeness {
  complete: boolean;
  missing: CompletenessGap[];
}

/**
 * Output of `computeRecipeNutrition`. `total` and `perServing` are full-float
 * precision (rounding is a display concern — S-6); `completeness` reports any
 * line left out of the sums.
 */
export interface RecipeNutrition {
  total: Nutrition;
  perServing: Nutrition;
  completeness: Completeness;
}

/**
 * A display-rounded nutrition profile (STEP-17, S-6). Structurally identical to
 * `Nutrition`, but its numbers are the output of the single rounding boundary
 * (`formatNutrition`). It is a distinct type so callers cannot accidentally
 * feed rounded values back into the full-precision engine and reintroduce
 * compounding error (F-5).
 */
export interface FormattedNutrition {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  micronutrients: Record<string, Micronutrient>;
}
