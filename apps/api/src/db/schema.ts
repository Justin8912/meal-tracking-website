import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  smallint,
  date,
  jsonb,
  timestamp,
  primaryKey,
  index,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { isNotNull } from 'drizzle-orm';
import type { Micronutrient } from '@meal-tracking/shared';

/**
 * Baseline Drizzle schema owned by the platform foundation (AD-3).
 *
 * These two tables are the foundation every feature table builds on. Feature
 * specs add their own tables in later migrations and FK to `workspaces.id`
 * (AD-4); they must not redefine these.
 */

/**
 * The auth-ready tenant table (AD-4). The MVP seeds exactly one default row
 * with a fixed UUID so feature migrations and the server-side workspace
 * resolver can reference it.
 */
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * The unit conversion reference set. `gramsPerUnit` is NULL for count-based
 * units such as `qty` that have no mass conversion.
 */
export const units = pgTable('units', {
  code: text('code').primaryKey(),
  label: text('label').notNull(),
  gramsPerUnit: numeric('grams_per_unit'),
});

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type UnitRow = typeof units.$inferSelect;

/**
 * Recipe-library feature tables (migration 0002, AD-2). Each owned table FKs to
 * the baseline `workspaces.id` (platform AD-4). Macros are typed columns; the
 * micronutrient map is JSONB absolute mass (F-10). These models mirror the
 * 0002 SQL exactly so Drizzle inserts (S-4) match the migrated DB.
 */

/** An owned ingredient: a USDA snapshot or a custom entry. */
export const ingredients = pgTable(
  'ingredients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: text('name').notNull(),
    source: text('source', { enum: ['usda', 'custom'] }).notNull(),
    fdcId: text('fdc_id'),
    referenceGrams: numeric('reference_grams').notNull().default('100'),
    gramWeightPerQty: numeric('gram_weight_per_qty'),
    unitGramEquivalents: jsonb('unit_gram_equivalents')
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    calories: numeric('calories'),
    proteinG: numeric('protein_g'),
    carbsG: numeric('carbs_g'),
    fatG: numeric('fat_g'),
    fiberG: numeric('fiber_g'),
    micronutrients: jsonb('micronutrients')
      .$type<Record<string, Micronutrient>>()
      .notNull()
      .default({}),
    preferredUnit: text('preferred_unit').notNull().default('g'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_ingredients_workspace_id').on(table.workspaceId),
    // Partial unique index: one USDA snapshot per fdc_id per workspace.
    // Custom ingredients (fdcId IS NULL) are unaffected.
    uniqueIndex('idx_ingredients_workspace_fdc_id')
      .on(table.workspaceId, table.fdcId)
      .where(isNotNull(table.fdcId)),
  ],
);

/** An owned recipe. */
export const recipes = pgTable(
  'recipes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: text('name').notNull(),
    mealType: text('meal_type', {
      enum: ['breakfast', 'lunch', 'dinner', 'snack'],
    }).notNull(),
    servings: integer('servings').notNull(),
    notes: text('notes'),
    sourceLink: text('source_link'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Soft delete: NULL = live; a timestamp = deleted at that time.
    // Physical deletes are avoided so plan_entries.recipe_id stays intact and
    // the weekly planner can still resolve name + nutrition for historical weeks.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_recipes_workspace_id').on(table.workspaceId),
    index('idx_recipes_workspace_meal_type').on(
      table.workspaceId,
      table.mealType,
    ),
  ],
);

/** Recipe -> ingredient join with quantity, unit, and ordering. */
export const recipeIngredients = pgTable(
  'recipe_ingredients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    quantity: numeric('quantity').notNull(),
    unitCode: text('unit_code')
      .notNull()
      .references(() => units.code),
    position: integer('position').notNull().default(0),
  },
  (table) => [
    index('idx_recipe_ingredients_recipe_id').on(table.recipeId),
  ],
);

/** Owned tags; label unique within a workspace. */
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    label: text('label').notNull(),
  },
  (table) => [
    index('idx_tags_workspace_id').on(table.workspaceId),
    unique('tags_workspace_id_label_key').on(table.workspaceId, table.label),
  ],
);

/** Recipe <-> tag join. */
export const recipeTags = pgTable(
  'recipe_tags',
  {
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.recipeId, table.tagId] }),
    index('idx_recipe_tags_tag_id').on(table.tagId),
  ],
);

/** USDA food-detail cache (pure accelerator, AD-3). */
export const usdaFoodCache = pgTable('usda_food_cache', {
  fdcId: text('fdc_id').primaryKey(),
  payload: jsonb('payload').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Weekly-planner feature table (migration 0003, AD-1). A plan entry is a thin
 * association of (week, day, slot, position) to a meal that is EITHER a saved
 * recipe OR a freeform entry. This model mirrors the 0003 SQL exactly so
 * Drizzle inserts (S-2) match the migrated DB. The XOR rule and the day/slot
 * ranges are enforced by CHECK constraints in 0003 (defence-in-depth alongside
 * the shared Zod refinement); Drizzle does not model CHECKs, so they live in
 * the SQL. recipe_id FKs to recipes(id) ON DELETE SET NULL so a deleted recipe
 * leaves the entry as a tombstone (AD-3).
 */
export const planEntries = pgTable(
  'plan_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    // The Monday DATE of the week, computed server-side (AD-2, S-4).
    weekStartDate: date('week_start_date').notNull(),
    // 0 (Monday) .. 6 (Sunday).
    dayOfWeek: smallint('day_of_week').notNull(),
    mealSlot: text('meal_slot', {
      enum: ['breakfast', 'lunch', 'dinner', 'snack'],
    }).notNull(),
    position: integer('position').notNull().default(0),
    // Null for a freeform meal or after the referenced recipe is deleted
    // (tombstone, AD-3).
    recipeId: uuid('recipe_id').references(() => recipes.id, {
      onDelete: 'set null',
    }),
    freeformTitle: text('freeform_title'),
    freeformDescription: text('freeform_description'),
    freeformLink: text('freeform_link'),
    // Ingredient-backed entry (alternative to recipe or freeform).
    ingredientId: uuid('ingredient_id').references(() => ingredients.id, {
      onDelete: 'set null',
    }),
    ingredientQuantity: numeric('ingredient_quantity'),
    ingredientUnitCode: text('ingredient_unit_code').references(() => units.code),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_plan_entries_workspace_week').on(
      table.workspaceId,
      table.weekStartDate,
    ),
  ],
);

export type IngredientRow = typeof ingredients.$inferSelect;
export type RecipeRow = typeof recipes.$inferSelect;
export type RecipeIngredientRow = typeof recipeIngredients.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type RecipeTagRow = typeof recipeTags.$inferSelect;
export type UsdaFoodCacheRow = typeof usdaFoodCache.$inferSelect;
export type PlanEntryRow = typeof planEntries.$inferSelect;
