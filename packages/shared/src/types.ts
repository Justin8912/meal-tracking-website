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
  /**
   * Optional tag labels applied to the recipe. Each label is upserted into the
   * workspace's tags (UNIQUE(workspace_id,label), AD-2) and linked via
   * recipe_tags. Omitted leaves tags unchanged on update / empty on create.
   */
  tags?: string[];
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
 * A workspace-scoped tag (AD-2). Labels are unique within a workspace and drive
 * the library's tag filter (FR-5, AC-5.1).
 */
export interface Tag {
  id: string;
  label: string;
}

/**
 * One hydrated ingredient line on a recipe-detail response: the join row's
 * quantity/unit plus the linked ingredient's name for display. Computed grams
 * and nutrition are deferred to the UI/engine in this slice (contracts.md).
 */
export interface RecipeDetailIngredient {
  ingredientId: string;
  name: string;
  quantity: number;
  unitCode: string;
}

/**
 * A single recipe with its ingredients and tags hydrated (GET /recipes/:id and
 * PUT response). Extends the core Recipe columns; computed nutrition is layered
 * on by the UI via the shared engine in a later slice (contracts.md).
 */
export interface RecipeDetail extends Recipe {
  ingredients: RecipeDetailIngredient[];
  tags: string[];
}

/** The four meal slots a planned meal can occupy in the weekly grid (AD-1). */
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/**
 * The payload accepted by POST /plans (FR-1, AD-3). A planned meal is EITHER a
 * reference to a saved recipe (`recipeId`) OR a freeform meal
 * (`freeformTitle` + optional description/link) - never both or neither (the
 * XOR rule, enforced by `planEntryInputSchema` and the DB CHECK in 0003).
 *
 * `weekStart` is any date within the target week; the server normalizes it to
 * the Monday DATE (AD-2, S-4). `dayOfWeek` is 0 (Monday) .. 6 (Sunday).
 */
export interface PlanEntryInput {
  /** Any date in the target week (YYYY-MM-DD); normalized to the Monday server-side. */
  weekStart: string;
  /** 0 (Monday) .. 6 (Sunday). */
  dayOfWeek: number;
  mealSlot: MealSlot;
  /** Optional ordering within a day/slot; defaults to 0 server-side. */
  position?: number;
  /** Set for a recipe-backed meal (XOR with freeformTitle). */
  recipeId?: string;
  /** Set for a freeform meal (XOR with recipeId). */
  freeformTitle?: string;
  freeformDescription?: string | null;
  freeformLink?: string | null;
}

/**
 * A persisted plan entry as returned by the API (contracts.md). Exactly one of
 * {`recipeId`} / {`freeformTitle`} is present. After the referenced recipe is
 * deleted in recipe-library, `recipeId` becomes null (tombstone, ON DELETE SET
 * NULL - AD-3) and the entry carries no freeform fields; the UI renders a
 * "recipe removed" state.
 */
export interface PlanEntry {
  id: string;
  /** The Monday DATE of the week (YYYY-MM-DD), computed server-side (AD-2). */
  weekStartDate: string;
  /** 0 (Monday) .. 6 (Sunday). */
  dayOfWeek: number;
  mealSlot: MealSlot;
  position: number;
  /** null after the referenced recipe is deleted (tombstone, AD-3). */
  recipeId: string | null;
  /** Convenience display name for a recipe-backed entry; absent/optional otherwise. */
  recipeName?: string;
  freeformTitle: string | null;
  freeformDescription: string | null;
  freeformLink: string | null;
}

/**
 * The weekly macros summary (FR-5, AD-6; GET /plans/summary). Macros only -
 * %DV/micronutrients are not summable across ingredients (S-5). Freeform meals
 * and recipe tombstones carry no nutrition and are reported as excluded so the
 * UI can state what is not counted (AC-5.2). The summary endpoint itself lands
 * in a later bundle; the type is defined here as the shared contract.
 */
export interface WeeklySummary {
  /** The Monday DATE of the week (YYYY-MM-DD). */
  weekStartDate: string;
  totals: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
  };
  /** Ids of the recipe-based entries counted in the totals. */
  countedEntryIds: string[];
  /** Ids of freeform meals + recipe tombstones excluded from the totals (AC-5.2). */
  excludedEntryIds: string[];
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
