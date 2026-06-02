import type { FastifyInstance } from 'fastify';
import { and, eq, count } from 'drizzle-orm';
import { z } from 'zod';
import { micronutrientSchema } from '@meal-tracking/shared';
import type { Micronutrient } from '@meal-tracking/shared';
import type { Db } from '../db/client.js';
import { ingredients, recipeIngredients, type IngredientRow } from '../db/schema.js';
import { PersistenceError } from '../db/persist.js';
import { resolveWorkspaceId } from '../workspace.js';
import { UsdaError, type UsdaClient } from '../usda/client.js';
import type { NormalizedFood } from '../usda/mapper.js';

/**
 * Ingredient routes (FR-2, FR-3, AD-3, AD-4).
 *
 * STEP-23 adds the USDA proxy: GET /ingredients/search and
 * GET /ingredients/usda/:fdcId call the cached USDA client server-side so the
 * browser never sees the api_key (AC-2.4). On the client's typed UsdaError the
 * shared error envelope is returned with a clear code (AC-2.3) so the UI can
 * offer custom entry. Responses are validated with Zod at the boundary (S-3).
 *
 * STEP-25 adds custom-ingredient create/list; STEP-27 adds USDA snapshot-at-add.
 */

/** Per-100g normalized nutrition; macros optional (absent = unknown, F-8/S-6). */
const per100gSchema = z.object({
  calories: z.number().optional(),
  proteinG: z.number().optional(),
  carbsG: z.number().optional(),
  fatG: z.number().optional(),
  fiberG: z.number().optional(),
  micronutrients: z.record(z.string(), micronutrientSchema),
});

/** A normalized USDA food as returned by the proxy (contracts.md). */
const normalizedFoodSchema = z.object({
  fdcId: z.string().min(1),
  description: z.string(),
  dataType: z.string(),
  per100g: per100gSchema,
});

const searchResultsSchema = z.array(normalizedFoodSchema);

const searchQuerySchema = z.object({
  q: z.string().min(1, 'q is required'),
});

const micronutrientMapSchema = z.record(z.string(), micronutrientSchema);

/**
 * POST /ingredients body for a custom ingredient (FR-3). Macros are individually
 * optional (a user may know only some facts; absent = unknown, never zero -
 * S-6), but at least one nutrition fact MUST be present so the ingredient has a
 * usable basis. Nutrition is on a reference_grams basis (default 100), uniform
 * with USDA snapshots so the engine treats both identically (AC-3.2).
 */
const customIngredientInputSchema = z
  .object({
    name: z.string().min(1, 'name is required'),
    referenceGrams: z.number().positive().default(100),
    calories: z.number().nonnegative().optional(),
    proteinG: z.number().nonnegative().optional(),
    carbsG: z.number().nonnegative().optional(),
    fatG: z.number().nonnegative().optional(),
    fiberG: z.number().nonnegative().optional(),
    micronutrients: micronutrientMapSchema.optional(),
    gramWeightPerQty: z.number().positive().optional(),
    unitGramEquivalents: z.record(z.string(), z.number().positive()).optional(),
  })
  .refine(
    (v) =>
      v.calories !== undefined ||
      v.proteinG !== undefined ||
      v.carbsG !== undefined ||
      v.fatG !== undefined ||
      v.fiberG !== undefined ||
      (v.micronutrients !== undefined &&
        Object.keys(v.micronutrients).length > 0),
    { message: 'a custom ingredient needs at least one nutrition fact' },
  );

/**
 * POST /ingredients/usda/:fdcId body (AD-4). The user confirms/overrides the
 * gram-equivalents at entry: `gramWeightPerQty` (grams per `qty` unit) and a map
 * of volume unit -> grams. Both optional; an ingredient lacking density data is
 * flagged downstream via completeness rather than silently estimated (F-4).
 */
const usdaSnapshotInputSchema = z.object({
  gramWeightPerQty: z.number().positive().optional(),
  unitGramEquivalents: z.record(z.string(), z.number().positive()).optional(),
});

/** A saved ingredient (custom or USDA snapshot) as returned by the API. */
const ingredientResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  source: z.enum(['usda', 'custom']),
  fdcId: z.string().nullable(),
  referenceGrams: z.number().positive(),
  gramWeightPerQty: z.number().nullable(),
  unitGramEquivalents: z.record(z.string(), z.number()),
  nutrition: per100gSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const ingredientListSchema = z.array(ingredientResponseSchema);

/** Parse a nullable numeric column (pg returns numerics as strings). */
function numOrUndefined(value: string | null): number | undefined {
  return value === null ? undefined : Number(value);
}

/**
 * Map a persisted ingredient row to the API response. Macro columns that are
 * NULL stay absent in `nutrition` (unknown, not zero - S-6); the micronutrient
 * map is carried through as absolute mass (AD-1).
 */
export function toIngredientResponse(row: IngredientRow) {
  const nutrition: z.infer<typeof per100gSchema> = {
    micronutrients: row.micronutrients as Record<string, Micronutrient>,
  };
  const calories = numOrUndefined(row.calories);
  const proteinG = numOrUndefined(row.proteinG);
  const carbsG = numOrUndefined(row.carbsG);
  const fatG = numOrUndefined(row.fatG);
  const fiberG = numOrUndefined(row.fiberG);
  if (calories !== undefined) nutrition.calories = calories;
  if (proteinG !== undefined) nutrition.proteinG = proteinG;
  if (carbsG !== undefined) nutrition.carbsG = carbsG;
  if (fatG !== undefined) nutrition.fatG = fatG;
  if (fiberG !== undefined) nutrition.fiberG = fiberG;

  return {
    id: row.id,
    name: row.name,
    source: row.source,
    fdcId: row.fdcId,
    referenceGrams: Number(row.referenceGrams),
    gramWeightPerQty: numOrUndefined(row.gramWeightPerQty) ?? null,
    unitGramEquivalents: row.unitGramEquivalents,
    nutrition,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Map a typed UsdaError to the shared error envelope. Never include the key or
 * a stack; the global handler would otherwise log a 500 stack for an upstream
 * dependency failure (AC-2.3, AC-2.4).
 */
function sendUsdaError(reply: import('fastify').FastifyReply, err: UsdaError) {
  return reply.code(err.statusCode).send({
    error: {
      code: err.code,
      message: err.rateLimited
        ? 'The nutrition service is rate limited; please try again shortly.'
        : 'The nutrition service is currently unavailable.',
    },
  });
}

export function registerIngredientsRoutes(
  app: FastifyInstance,
  _db: Db,
  usda: UsdaClient,
): void {
  app.get('/ingredients/search', async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid search query',
        },
      });
    }

    let results: NormalizedFood[];
    try {
      results = await usda.searchFoods(parsed.data.q);
    } catch (err) {
      if (err instanceof UsdaError) {
        return sendUsdaError(reply, err);
      }
      throw err;
    }

    const body = searchResultsSchema.parse(results);
    return reply.code(200).send(body);
  });

  app.get<{ Params: { fdcId: string } }>(
    '/ingredients/usda/:fdcId',
    async (request, reply) => {
      const { fdcId } = request.params;

      let food: NormalizedFood;
      try {
        food = await usda.getFood(fdcId);
      } catch (err) {
        if (err instanceof UsdaError) {
          return sendUsdaError(reply, err);
        }
        throw err;
      }

      const body = normalizedFoodSchema.parse(food);
      return reply.code(200).send(body);
    },
  );

  // FR-2/AD-4: add a USDA food to the workspace by snapshotting its per-100g
  // nutrition into an owned source='usda' ingredient. The snapshot is
  // independent of usda_food_cache (a pure accelerator) so cache eviction never
  // rewrites historical recipes (F-11). Confirmed gram-equivalents persist for
  // unit conversion (AC-4.5).
  app.post<{ Params: { fdcId: string } }>(
    '/ingredients/usda/:fdcId',
    async (request, reply) => {
      const parsedBody = usdaSnapshotInputSchema.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message:
              parsedBody.error.issues[0]?.message ?? 'Invalid snapshot payload',
          },
        });
      }

      const { fdcId } = request.params;
      let food: NormalizedFood;
      try {
        food = await usda.getFood(fdcId);
      } catch (err) {
        if (err instanceof UsdaError) {
          return sendUsdaError(reply, err);
        }
        throw err;
      }

      const p = food.per100g;
      const workspaceId = await resolveWorkspaceId(_db);
      let row: IngredientRow | undefined;
      try {
        // Insert-or-update: if the same fdc_id was already snapshotted, update
        // its nutrition (particularly calories, which may have been NULL before
        // the Atwater fix) so stale rows get corrected when the food is next
        // used in a recipe. The partial unique index on (workspace_id, fdc_id)
        // identifies the conflict target.
        const newCalories = p.calories !== undefined ? String(p.calories) : null;
        const inserted = await _db
          .insert(ingredients)
          .values({
            workspaceId,
            name: food.description,
            source: 'usda',
            fdcId: food.fdcId,
            referenceGrams: '100',
            gramWeightPerQty:
              parsedBody.data.gramWeightPerQty !== undefined
                ? String(parsedBody.data.gramWeightPerQty)
                : null,
            unitGramEquivalents: parsedBody.data.unitGramEquivalents ?? {},
            calories: newCalories,
            proteinG: p.proteinG !== undefined ? String(p.proteinG) : null,
            carbsG: p.carbsG !== undefined ? String(p.carbsG) : null,
            fatG: p.fatG !== undefined ? String(p.fatG) : null,
            fiberG: p.fiberG !== undefined ? String(p.fiberG) : null,
            micronutrients: p.micronutrients,
          })
          .onConflictDoUpdate({
            target: [ingredients.workspaceId, ingredients.fdcId],
            set: {
              // Refresh nutrition from the latest USDA data. In particular,
              // calories may have been NULL (pre-Atwater fix) and should now
              // be populated. Leave other user-settable fields (name, gramWeightPerQty,
              // unitGramEquivalents) unchanged so manual overrides are preserved.
              calories: newCalories,
              proteinG: p.proteinG !== undefined ? String(p.proteinG) : null,
              carbsG: p.carbsG !== undefined ? String(p.carbsG) : null,
              fatG: p.fatG !== undefined ? String(p.fatG) : null,
              fiberG: p.fiberG !== undefined ? String(p.fiberG) : null,
              micronutrients: p.micronutrients,
              updatedAt: new Date(),
            },
          })
          .returning();
        row = inserted[0];

        if (!row) {
          // Fallback — should not happen with onConflictDoUpdate but guard anyway.
          const existing = await _db
            .select()
            .from(ingredients)
            .where(
              and(
                eq(ingredients.workspaceId, workspaceId),
                eq(ingredients.fdcId, food.fdcId),
              ),
            )
            .limit(1);
          row = existing[0];
        }
      } catch (err) {
        throw new PersistenceError('Failed to snapshot USDA ingredient', {
          cause: err,
        });
      }
      if (!row) {
        throw new PersistenceError('USDA snapshot insert returned no row');
      }

      const body = ingredientResponseSchema.parse(toIngredientResponse(row));
      return reply.code(200).send(body);
    },
  );

  // FR-3: create a custom ingredient (workspace-scoped, reference_grams basis).
  app.post('/ingredients', async (request, reply) => {
    const parsed = customIngredientInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message:
            parsed.error.issues[0]?.message ?? 'Invalid ingredient payload',
        },
      });
    }

    const input = parsed.data;
    const workspaceId = await resolveWorkspaceId(_db);

    let row: IngredientRow | undefined;
    try {
      // Numeric columns take string values; absent macros stay NULL (unknown,
      // never zero - S-6). Fully parameterized Drizzle insert (S-4).
      const inserted = await _db
        .insert(ingredients)
        .values({
          workspaceId,
          name: input.name,
          source: 'custom',
          fdcId: null,
          referenceGrams: String(input.referenceGrams),
          gramWeightPerQty:
            input.gramWeightPerQty !== undefined
              ? String(input.gramWeightPerQty)
              : null,
          unitGramEquivalents: input.unitGramEquivalents ?? {},
          calories: input.calories !== undefined ? String(input.calories) : null,
          proteinG: input.proteinG !== undefined ? String(input.proteinG) : null,
          carbsG: input.carbsG !== undefined ? String(input.carbsG) : null,
          fatG: input.fatG !== undefined ? String(input.fatG) : null,
          fiberG: input.fiberG !== undefined ? String(input.fiberG) : null,
          micronutrients: input.micronutrients ?? {},
        })
        .returning();
      row = inserted[0];
    } catch (err) {
      throw new PersistenceError('Failed to persist ingredient', { cause: err });
    }
    if (!row) {
      throw new PersistenceError('Ingredient insert returned no row');
    }

    const body = ingredientResponseSchema.parse(toIngredientResponse(row));
    return reply.code(201).send(body);
  });

  // AC-3.3: list the workspace's saved ingredients (custom + USDA snapshots).
  app.get('/ingredients', async (_request, reply) => {
    const workspaceId = await resolveWorkspaceId(_db);
    const rows = await _db
      .select()
      .from(ingredients)
      .where(eq(ingredients.workspaceId, workspaceId));

    const body = ingredientListSchema.parse(rows.map(toIngredientResponse));
    return reply.code(200).send(body);
  });

  // DELETE /ingredients/:id — remove a custom ingredient from the workspace.
  // Only custom (user-created) ingredients should be deletable; USDA snapshots
  // are shared reference data and deleting them would silently corrupt any
  // recipe that references them. Returns 204 on success, 404 if not found,
  // 400 if the ingredient is USDA-sourced.
  app.delete<{ Params: { id: string } }>(
    '/ingredients/:id',
    async (request, reply) => {
      const workspaceId = await resolveWorkspaceId(_db);
      const { id } = request.params;

      const rows = await _db
        .select()
        .from(ingredients)
        .where(and(eq(ingredients.id, id), eq(ingredients.workspaceId, workspaceId)));

      const row = rows[0];
      if (!row) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Ingredient not found' },
        });
      }

      // Guard: refuse to delete an ingredient that is still used in a recipe.
      // The recipe_ingredients FK has no ON DELETE clause (RESTRICT by default),
      // so the DB would reject it anyway — surface a clear message first.
      const usageResult = await _db
        .select({ n: count() })
        .from(recipeIngredients)
        .where(eq(recipeIngredients.ingredientId, id));
      const usageCount = Number(usageResult[0]?.n ?? 0);
      if (usageCount > 0) {
        return reply.code(400).send({
          error: {
            code: 'INGREDIENT_IN_USE',
            message: `This ingredient is used in ${usageCount} recipe${usageCount === 1 ? '' : 's'} and cannot be removed. Delete it from those recipes first.`,
          },
        });
      }

      try {
        await _db
          .delete(ingredients)
          .where(and(eq(ingredients.id, id), eq(ingredients.workspaceId, workspaceId)));
      } catch (err) {
        throw new PersistenceError('Failed to delete ingredient', { cause: err });
      }

      return reply.code(204).send();
    },
  );
}
