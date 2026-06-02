import type { Micronutrient } from '@meal-tracking/shared';

/**
 * USDA nutrient-number mapping (AD-3, F-7, F-8).
 *
 * USDA FoodData Central returns the same nutrient under two different JSON
 * shapes depending on the endpoint:
 *   - /foods/search items are FLAT: `{ nutrientNumber, value, unitName }`.
 *   - /food/{fdcId} NESTS: `{ nutrient: { number, name, unitName }, amount }`.
 *
 * Both are mapped by the stable nutrient NUMBER (a USDA-assigned identifier that
 * does not change across datasets) into one normalized per-100g model. The four
 * macros plus fiber are pulled into typed fields; any other nutrient with a
 * mass unit is carried in the micronutrient map as absolute mass (AD-1).
 *
 * A nutrient that is absent from the payload is OMITTED from the result - it is
 * never zero-filled (F-8, S-6): zero understates totals and is indistinguishable
 * from a true zero. The completeness layer downstream reports the gap instead.
 */

/** Stable USDA nutrient numbers for the five tracked macros. */
export const NUTRIENT_NUMBER = {
  calories: '208', // Energy (kcal)
  proteinG: '203', // Protein
  fatG: '204', // Total lipid (fat)
  carbsG: '205', // Carbohydrate, by difference
  fiberG: '291', // Fiber, total dietary
} as const;

const MACRO_NUMBERS = new Set<string>(Object.values(NUTRIENT_NUMBER));

/**
 * Per-100g nutrition as normalized from USDA. Macros are OPTIONAL: an absent
 * macro means "unknown", never zero (F-8). The micronutrient map holds every
 * other reported nutrient as absolute mass.
 */
export interface NormalizedPer100g {
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  micronutrients: Record<string, Micronutrient>;
}

/** A normalized USDA food (search result item or detail), per-100g. */
export interface NormalizedFood {
  fdcId: string;
  description: string;
  dataType: string;
  per100g: NormalizedPer100g;
}

/** One nutrient extracted from either payload shape. */
interface ExtractedNutrient {
  number: string;
  name: string;
  unit: string;
  amount: number;
}

/** A USDA food nutrient in either the flat (search) or nested (detail) shape. */
interface RawFoodNutrient {
  // flat (search) shape
  nutrientNumber?: string | number;
  nutrientName?: string;
  unitName?: string;
  value?: number;
  // nested (detail) shape
  nutrient?: {
    number?: string | number;
    name?: string;
    unitName?: string;
  };
  amount?: number;
}

interface RawFood {
  fdcId?: string | number;
  description?: string;
  dataType?: string;
  foodNutrients?: RawFoodNutrient[];
}

/** Normalize a nutrient-name string for use as a micronutrient map key. */
function micronutrientKey(name: string): string {
  // USDA names like "Calcium, Ca" / "Iron, Fe" -> "Calcium" / "Iron".
  return name.split(',')[0]!.trim();
}

/** Pull the stable number/name/unit/amount out of the FLAT search shape. */
function extractFromSearch(raw: RawFoodNutrient): ExtractedNutrient | undefined {
  if (raw.nutrientNumber === undefined || raw.value === undefined) {
    return undefined;
  }
  return {
    number: String(raw.nutrientNumber),
    name: raw.nutrientName ?? '',
    unit: (raw.unitName ?? '').toLowerCase(),
    amount: raw.value,
  };
}

/** Pull the stable number/name/unit/amount out of the NESTED detail shape. */
function extractFromDetail(raw: RawFoodNutrient): ExtractedNutrient | undefined {
  const number = raw.nutrient?.number;
  if (number === undefined || raw.amount === undefined) {
    return undefined;
  }
  return {
    number: String(number),
    name: raw.nutrient?.name ?? '',
    unit: (raw.nutrient?.unitName ?? '').toLowerCase(),
    amount: raw.amount,
  };
}

/** Assemble the normalized per-100g model from extracted nutrients. */
function buildPer100g(nutrients: ExtractedNutrient[]): NormalizedPer100g {
  const per100g: NormalizedPer100g = { micronutrients: {} };

  for (const n of nutrients) {
    switch (n.number) {
      case NUTRIENT_NUMBER.calories:
        per100g.calories = n.amount;
        break;
      case NUTRIENT_NUMBER.proteinG:
        per100g.proteinG = n.amount;
        break;
      case NUTRIENT_NUMBER.fatG:
        per100g.fatG = n.amount;
        break;
      case NUTRIENT_NUMBER.carbsG:
        per100g.carbsG = n.amount;
        break;
      case NUTRIENT_NUMBER.fiberG:
        per100g.fiberG = n.amount;
        break;
      default: {
        if (MACRO_NUMBERS.has(n.number) || !n.name) {
          break;
        }
        // Carry every other reported nutrient as absolute mass (AD-1).
        per100g.micronutrients[micronutrientKey(n.name)] = {
          amount: n.amount,
          unit: n.unit || 'g',
        };
      }
    }
  }

  // Atwater derivation: when the USDA response omits calories (nutrient 208)
  // but supplies macros, calculate from protein/carbs/fat using the standard
  // Atwater factors (1g protein = 4 kcal, 1g carbs = 4 kcal, 1g fat = 9 kcal).
  // This keeps the calories field non-null so the nutrition engine includes it
  // in per-serving and weekly totals, and so it is persisted in the ingredients
  // snapshot. Only apply when at least one macro is present; never fabricate a
  // value of 0 from nothing.
  if (
    per100g.calories === undefined &&
    (per100g.proteinG !== undefined ||
      per100g.carbsG !== undefined ||
      per100g.fatG !== undefined)
  ) {
    const derived =
      (per100g.proteinG ?? 0) * 4 +
      (per100g.carbsG ?? 0) * 4 +
      (per100g.fatG ?? 0) * 9;
    per100g.calories = Math.round(derived * 10) / 10; // one decimal, like other values
  }

  return per100g;
}

function baseFood(raw: RawFood): Omit<NormalizedFood, 'per100g'> {
  return {
    fdcId: String(raw.fdcId ?? ''),
    description: raw.description ?? '',
    dataType: raw.dataType ?? '',
  };
}

/** Map a /foods/search result item (flat shape) to the normalized model. */
export function mapSearchFood(raw: RawFood): NormalizedFood {
  const nutrients = (raw.foodNutrients ?? [])
    .map(extractFromSearch)
    .filter((n): n is ExtractedNutrient => n !== undefined);
  return { ...baseFood(raw), per100g: buildPer100g(nutrients) };
}

/** Map a /food/{fdcId} detail payload (nested shape) to the normalized model. */
export function mapDetailFood(raw: RawFood): NormalizedFood {
  const nutrients = (raw.foodNutrients ?? [])
    .map(extractFromDetail)
    .filter((n): n is ExtractedNutrient => n !== undefined);
  return { ...baseFood(raw), per100g: buildPer100g(nutrients) };
}
