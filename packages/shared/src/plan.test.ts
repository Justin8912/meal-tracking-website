import { describe, it, expect } from 'vitest';
import { planEntryInputSchema } from './schemas.js';

/**
 * STEP-1 test-first for the shared plan-entry schema (STEP-2). The shared Zod
 * schema is the contract for both api and web (S-1) and the first line of
 * defence for the recipe/freeform XOR (AD-3): a body that carries BOTH a
 * recipeId and a freeformTitle, or NEITHER, must be rejected before it reaches
 * the route. dayOfWeek is pinned to 0..6 and mealSlot to the four-slot enum so
 * an out-of-range day or an unknown slot cannot pass. These tests fail before
 * STEP-2 (schema not yet implemented).
 */
describe('planEntryInputSchema', () => {
  const recipeId = '11111111-1111-1111-1111-111111111111';

  it('parses a recipe-only body', () => {
    const result = planEntryInputSchema.safeParse({
      weekStart: '2026-06-01',
      dayOfWeek: 0,
      mealSlot: 'breakfast',
      recipeId,
    });
    expect(result.success).toBe(true);
  });

  it('parses a freeform-only body', () => {
    const result = planEntryInputSchema.safeParse({
      weekStart: '2026-06-01',
      dayOfWeek: 3,
      mealSlot: 'dinner',
      freeformTitle: 'Leftovers',
      freeformDescription: 'Whatever is in the fridge',
      freeformLink: 'https://example.com/leftovers',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a body carrying BOTH a recipeId and a freeformTitle (XOR)', () => {
    const result = planEntryInputSchema.safeParse({
      weekStart: '2026-06-01',
      dayOfWeek: 0,
      mealSlot: 'lunch',
      recipeId,
      freeformTitle: 'Leftovers',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a body carrying NEITHER a recipeId nor a freeformTitle (XOR)', () => {
    const result = planEntryInputSchema.safeParse({
      weekStart: '2026-06-01',
      dayOfWeek: 0,
      mealSlot: 'snack',
    });
    expect(result.success).toBe(false);
  });

  it('rejects dayOfWeek 7 (out of the 0..6 range)', () => {
    const result = planEntryInputSchema.safeParse({
      weekStart: '2026-06-01',
      dayOfWeek: 7,
      mealSlot: 'breakfast',
      recipeId,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative dayOfWeek', () => {
    const result = planEntryInputSchema.safeParse({
      weekStart: '2026-06-01',
      dayOfWeek: -1,
      mealSlot: 'breakfast',
      recipeId,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid mealSlot', () => {
    const result = planEntryInputSchema.safeParse({
      weekStart: '2026-06-01',
      dayOfWeek: 0,
      mealSlot: 'brunch',
      recipeId,
    });
    expect(result.success).toBe(false);
  });
});
