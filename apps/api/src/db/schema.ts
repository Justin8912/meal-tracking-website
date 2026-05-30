import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  jsonb,
  timestamp,
  primaryKey,
  index,
  unique,
} from 'drizzle-orm/pg-core';
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('idx_ingredients_workspace_id').on(table.workspaceId)],
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

export type IngredientRow = typeof ingredients.$inferSelect;
export type RecipeRow = typeof recipes.$inferSelect;
export type RecipeIngredientRow = typeof recipeIngredients.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type RecipeTagRow = typeof recipeTags.$inferSelect;
export type UsdaFoodCacheRow = typeof usdaFoodCache.$inferSelect;
