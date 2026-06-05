import { describe, it, expect } from 'vitest';
import {
  recipeIngredientSchema,
  recipeInputSchema,
  nutritionSchema,
} from './schemas.js';

/**
 * Test-first (STEP-2) for the shared recipe/ingredient/Nutrition schemas
 * (STEP-3). These schemas are the single contract for api and web (S-3) and
 * must mirror the migration 0002 columns: servings >= 1, a four-slot meal_type
 * enum, and ingredients that require both a quantity and a unit. They fail
 * before STEP-3 implements the schemas.
 */

const validIngredient = {
  ingredientId: '00000000-0000-0000-0000-0000000000aa',
  quantity: 2,
  unitCode: 'cup',
};

const validRecipe = {
  name: 'Oatmeal',
  mealType: 'breakfast' as const,
  servings: 2,
  ingredients: [validIngredient],
};

describe('recipeIngredientSchema', () => {
  it('parses an ingredient with a quantity and unit', () => {
    expect(recipeIngredientSchema.safeParse(validIngredient).success).toBe(true);
  });

  it('rejects an ingredient missing the quantity', () => {
    const { quantity, ...rest } = validIngredient;
    void quantity;
    expect(recipeIngredientSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an ingredient missing the unit', () => {
    const { unitCode, ...rest } = validIngredient;
    void unitCode;
    expect(recipeIngredientSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a non-positive quantity', () => {
    expect(
      recipeIngredientSchema.safeParse({ ...validIngredient, quantity: 0 })
        .success,
    ).toBe(false);
  });
});

describe('recipeInputSchema', () => {
  it('parses a valid recipe', () => {
    expect(recipeInputSchema.safeParse(validRecipe).success).toBe(true);
  });

  it('rejects servings < 1', () => {
    expect(
      recipeInputSchema.safeParse({ ...validRecipe, servings: 0 }).success,
    ).toBe(false);
  });

  it('rejects a non-integer servings', () => {
    expect(
      recipeInputSchema.safeParse({ ...validRecipe, servings: 1.5 }).success,
    ).toBe(false);
  });

  it('rejects an invalid meal_type', () => {
    expect(
      recipeInputSchema.safeParse({ ...validRecipe, mealType: 'brunch' })
        .success,
    ).toBe(false);
  });

  it('accepts every valid meal_type slot', () => {
    for (const mealType of ['breakfast', 'lunch', 'dinner', 'snack']) {
      expect(
        recipeInputSchema.safeParse({ ...validRecipe, mealType }).success,
      ).toBe(true);
    }
  });

  it('rejects a recipe with a blank name', () => {
    expect(
      recipeInputSchema.safeParse({ ...validRecipe, name: '' }).success,
    ).toBe(false);
  });
});

describe('nutritionSchema', () => {
  it('parses macros plus an absolute-mass micronutrient map', () => {
    const result = nutritionSchema.safeParse({
      calories: 150,
      proteinG: 5,
      carbsG: 27,
      fatG: 3,
      fiberG: 4,
      micronutrients: {
        iron: { amount: 1.8, unit: 'mg' },
        vitaminC: { amount: 0, unit: 'mg' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a micronutrient missing its unit', () => {
    const result = nutritionSchema.safeParse({
      calories: 150,
      proteinG: 5,
      carbsG: 27,
      fatG: 3,
      fiberG: 4,
      micronutrients: { iron: { amount: 1.8 } },
    });
    expect(result.success).toBe(false);
  });
});
