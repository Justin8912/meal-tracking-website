/**
 * Shared domain types for the meal-tracking platform.
 *
 * These types are the single source of truth for the API contract and are
 * imported by both apps/api and apps/web (S-3). They mirror the baseline
 * database schema (workspaces, units) and the shared error envelope defined
 * in references/contracts.md.
 */

/**
 * A workspace is the auth-ready tenant boundary (AD-4). In the MVP there is
 * exactly one seeded default workspace; every owned record FKs to it.
 */
export interface Workspace {
  id: string;
  name: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/**
 * A measurement unit in the conversion reference set.
 *
 * `gramsPerUnit` is the number of grams one unit represents, or `null` for
 * count-based units such as `qty` that have no mass conversion.
 */
export interface Unit {
  code: string;
  label: string;
  gramsPerUnit: number | null;
}

/** The four meal-type slots a recipe can belong to (AC-1.1). */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/**
 * A single micronutrient measured as absolute mass (AD-1, F-10). The unit is
 * carried explicitly (e.g. 'mg', 'mcg') so amounts aggregate correctly across
 * ingredients; values are never zero-filled when unknown (S-6).
 */
export interface Micronutrient {
  amount: number;
  unit: string;
}

/**
 * A nutrition profile: the five macros plus an absolute-mass micronutrient
 * map keyed by nutrient name (AD-1). Full precision internally; rounding is a
 * display concern (S-6).
 */
export interface Nutrition {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  micronutrients: Record<string, Micronutrient>;
}

/**
 * An owned ingredient row (USDA snapshot or custom). Macros are stored as
 * absolute values on a `referenceGrams` basis with the micronutrient map as
 * absolute mass (AD-2, F-10). Bundle 1 defines the shape; ingredient CRUD and
 * USDA snapshotting land in later bundles.
 */
export interface Ingredient {
  id: string;
  name: string;
  source: 'usda' | 'custom';
  /** USDA FoodData Central id when sourced from USDA; null for custom. */
  fdcId: string | null;
  /** Grams the stored nutrition is measured against (default 100). */
  referenceGrams: number;
  nutrition: Nutrition;
}

/**
 * One ingredient line on a recipe: a reference to an ingredient plus the
 * quantity and unit it is used in. Both quantity and unit are required so the
 * engine can resolve grams (AD-4); a missing unit would make the line
 * unconvertible.
 */
export interface RecipeIngredient {
  ingredientId: string;
  quantity: number;
  unitCode: string;
}

/**
 * The payload accepted by POST /recipes. The persisted/response Recipe extends
 * this with server-owned fields (id, timestamps, resolved nutrition).
 */
export interface RecipeInput {
  name: string;
  mealType: MealType;
  /** Must be >= 1; per-serving nutrition divides by this (AD-1). */
  servings: number;
  notes?: string | null;
  sourceLink?: string | null;
  ingredients: RecipeIngredient[];
}

/**
 * A persisted recipe as returned by the API. Bundle 1's thin list/create path
 * returns the core columns; ingredient hydration, tags, and computed nutrition
 * arrive in later bundles (contracts.md).
 */
export interface Recipe {
  id: string;
  name: string;
  mealType: MealType;
  servings: number;
  notes: string | null;
  sourceLink: string | null;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
}

/**
 * The shared error envelope returned for every non-2xx API response
 * (references/contracts.md). Feature specs reuse this shape so the frontend
 * can surface failures consistently (AC-1.5).
 */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
}
