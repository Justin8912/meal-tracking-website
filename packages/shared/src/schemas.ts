import { z } from 'zod';
import type {
  Workspace,
  Unit,
  ErrorEnvelope,
  MealType,
  MealSlot,
  Micronutrient,
  Nutrition,
  RecipeIngredient,
  RecipeInput,
  Recipe,
  Tag,
  RecipeDetailIngredient,
  RecipeDetail,
  WeeklySummary,
} from './types.js';

/**
 * Runtime-validating Zod schemas matching the shared domain types. The API
 * validates inputs and outputs against these at the boundary (S-3); the
 * frontend imports the same schemas so the contract cannot drift.
 */

export const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  createdAt: z.string().min(1),
}) satisfies z.ZodType<Workspace>;

export const unitSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  gramsPerUnit: z.number().nullable(),
}) satisfies z.ZodType<Unit>;

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
}) satisfies z.ZodType<ErrorEnvelope>;

/** The four meal-type slots; mirrors the recipes.meal_type CHECK in 0002. */
export const mealTypeSchema = z.enum([
  'breakfast',
  'lunch',
  'dinner',
  'snack',
]) satisfies z.ZodType<MealType>;

export const micronutrientSchema = z.object({
  amount: z.number(),
  unit: z.string().min(1),
}) satisfies z.ZodType<Micronutrient>;

export const nutritionSchema = z.object({
  calories: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number(),
  micronutrients: z.record(z.string(), micronutrientSchema),
}) satisfies z.ZodType<Nutrition>;

/**
 * A recipe ingredient line. Both quantity and unit are required (AD-4) and the
 * quantity must be positive so a line can always resolve to grams.
 */
export const recipeIngredientSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCode: z.string().min(1),
}) satisfies z.ZodType<RecipeIngredient>;

/**
 * POST /recipes request body. servings must be an integer >= 1 (matches the
 * recipes.servings CHECK in 0002); meal_type is one of the four slots; at
 * least one ingredient is required (AC-1.1).
 */
export const recipeInputSchema = z.object({
  name: z.string().min(1),
  mealType: mealTypeSchema,
  servings: z.number().int().min(1),
  notes: z.string().nullish(),
  sourceLink: z.string().nullish(),
  ingredients: z.array(recipeIngredientSchema).min(1),
  // Optional tag labels; upserted workspace-scoped and linked via recipe_tags
  // (AD-2, FR-5). Each label is non-empty after trimming.
  tags: z.array(z.string().trim().min(1)).optional(),
}) satisfies z.ZodType<RecipeInput>;

/** A persisted recipe as returned by the API (core columns; contracts.md). */
export const recipeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  mealType: mealTypeSchema,
  servings: z.number().int().min(1),
  notes: z.string().nullable(),
  sourceLink: z.string().nullable(),
  tags: z.array(z.string()),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}) satisfies z.ZodType<Recipe>;

/** A workspace-scoped tag (AD-2; GET/POST /tags). */
export const tagSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1),
}) satisfies z.ZodType<Tag>;

export const tagListSchema = z.array(tagSchema);

/** POST /tags request body: a single non-empty label, trimmed (S-3). */
export const tagInputSchema = z.object({
  label: z.string().trim().min(1, 'label is required'),
});

/** One hydrated ingredient line on a recipe-detail response (contracts.md). */
export const recipeDetailIngredientSchema = z.object({
  ingredientId: z.string().uuid(),
  name: z.string().min(1),
  quantity: z.number().positive(),
  unitCode: z.string().min(1),
}) satisfies z.ZodType<RecipeDetailIngredient>;

/**
 * A recipe with its ingredients and tags hydrated (GET /recipes/:id, PUT
 * response). Computed nutrition is deferred to the UI/engine (contracts.md).
 */
export const recipeDetailSchema = recipeSchema.extend({
  ingredients: z.array(recipeDetailIngredientSchema),
  tags: z.array(z.string().min(1)),
}) satisfies z.ZodType<RecipeDetail>;

/** The four meal slots; mirrors the plan_entries.meal_slot CHECK in 0003. */
export const mealSlotSchema = z.enum([
  'breakfast',
  'lunch',
  'dinner',
  'snack',
]) satisfies z.ZodType<MealSlot>;

/**
 * POST /plans request body (FR-1, AD-3, S-1). `weekStart` is any date in the
 * target week as YYYY-MM-DD; the server normalizes it to the Sunday DATE (AD-2,
 * S-4). `dayOfWeek` is pinned to 0..6 (Sunday..Saturday) and `mealSlot` to the
 * four-slot enum.
 *
 * The `.refine()` enforces the recipe/freeform XOR (AD-3): exactly one of
 * {`recipeId`} / {`freeformTitle`} must be present, never both or neither. This
 * is the contract-level guard that mirrors the DB-level XOR CHECK in 0003, so a
 * malformed plan body is rejected before it ever reaches the route.
 */
export const planEntryInputSchema = z
  .object({
    // A calendar date, not a timestamp; the server derives the Sunday from it.
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'weekStart must be YYYY-MM-DD'),
    dayOfWeek: z.number().int().min(0).max(6),
    mealSlot: mealSlotSchema,
    position: z.number().int().min(0).optional(),
    recipeId: z.string().uuid().optional(),
    freeformTitle: z.string().trim().min(1).optional(),
    freeformDescription: z.string().nullish(),
    freeformLink: z.string().nullish(),
    ingredientId: z.string().uuid().optional(),
    ingredientQuantity: z.number().positive().optional(),
    ingredientUnitCode: z.string().min(1).optional(),
  })
  .refine(
    (v) => {
      const count = [v.recipeId, v.freeformTitle, v.ingredientId].filter(
        (x) => x != null,
      ).length;
      return count === 1;
    },
    {
      message:
        'A plan entry must reference exactly one of a recipeId, freeformTitle, or ingredientId',
      path: ['recipeId'],
    },
  )
  .refine(
    (v) =>
      v.ingredientId == null ||
      (v.ingredientQuantity != null && v.ingredientUnitCode != null),
    {
      message:
        'ingredientQuantity and ingredientUnitCode are required when ingredientId is set',
      path: ['ingredientQuantity'],
    },
  );

/**
 * GET /plans/summary response body (FR-5, AD-6; S-1). Macros ONLY - the totals
 * carry the five macro keys with no micronutrient map, because %DV/micros are
 * not summable across ingredients at the weekly level (AC-5.1). The totals are
 * the result of summing UNROUNDED per-serving values across the week's
 * recipe-based entries and rounding ONCE at the boundary (F-20, S-5); freeform
 * meals and recipe tombstones carry no nutrition and are reported in
 * `excludedEntryIds` so the UI can state what is not counted (AC-5.2). The API
 * validates its response against this schema before sending (S-1).
 */
export const weeklySummarySchema = z.object({
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totals: z.object({
    calories: z.number(),
    proteinG: z.number(),
    carbsG: z.number(),
    fatG: z.number(),
    fiberG: z.number(),
  }),
  countedEntryIds: z.array(z.string().uuid()),
  excludedEntryIds: z.array(z.string().uuid()),
}) satisfies z.ZodType<WeeklySummary>;
