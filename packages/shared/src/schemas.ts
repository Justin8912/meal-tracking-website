import { z } from 'zod';
import type {
  Workspace,
  Unit,
  ErrorEnvelope,
  MealType,
  Micronutrient,
  Nutrition,
  RecipeIngredient,
  RecipeInput,
  Recipe,
  Tag,
  RecipeDetailIngredient,
  RecipeDetail,
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
