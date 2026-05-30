import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { recipeInputSchema, recipeSchema } from '@meal-tracking/shared';
import type { Recipe } from '@meal-tracking/shared';
import type { Db } from '../db/client.js';
import { recipes, type RecipeRow } from '../db/schema.js';
import { PersistenceError } from '../db/persist.js';
import { resolveWorkspaceId } from '../workspace.js';

/**
 * Thin recipe create/list path - the recipe-library walking skeleton (STEP-6).
 * Full CRUD, filter, and search arrive in Bundle 4 (AD-6); this proves the
 * web->api->postgres persistence round-trip only.
 *
 * POST validates the body against the shared Zod schema (S-3) and, on failure,
 * raises a 400 carrying the platform error envelope. The recipe row is inserted
 * workspace-scoped: the workspace id is resolved server-side via
 * resolveWorkspaceId() (platform AD-4) and set on the row through a fully
 * parameterized Drizzle insert (S-4); the committed row (not the request echo)
 * is returned so server-applied defaults/ids are visible. A direct insert is
 * used rather than the generic persist() helper because the recipes table has
 * nullable optional columns the helper's generic Omit type does not surface;
 * the workspace scoping and parameterization are preserved. A DB failure is
 * surfaced as a PersistenceError (5xx envelope), never a false success
 * (AC-1.5). The validated `ingredients` array is part of the contract but
 * persisting the recipe_ingredients join is deferred to Bundle 4 full CRUD.
 *
 * GET reads the workspace's recipes from the DB (not a hardcoded list) and
 * validates each row against the shared Recipe schema before sending.
 */

const recipeListSchema = z.array(recipeSchema);

/** Map a persisted DB row to the shared Recipe response shape. */
function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    name: row.name,
    mealType: row.mealType,
    servings: row.servings,
    notes: row.notes,
    sourceLink: row.sourceLink,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function registerRecipesRoutes(app: FastifyInstance, db: Db): void {
  app.post('/recipes', async (request, reply) => {
    const parsed = recipeInputSchema.safeParse(request.body);
    if (!parsed.success) {
      // Surface as a 400 in the shared error envelope (AC-1.5, S-3).
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid recipe payload',
        },
      });
    }

    const input = parsed.data;
    const workspaceId = await resolveWorkspaceId(db);

    let row: RecipeRow | undefined;
    try {
      const inserted = await db
        .insert(recipes)
        .values({
          workspaceId,
          name: input.name,
          mealType: input.mealType,
          servings: input.servings,
          notes: input.notes ?? null,
          sourceLink: input.sourceLink ?? null,
        })
        .returning();
      row = inserted[0];
    } catch (err) {
      // Never swallow a write failure or report a false success (AC-1.5); the
      // global handler serializes this into the shared 5xx error envelope.
      throw new PersistenceError('Failed to persist recipe', { cause: err });
    }
    if (!row) {
      throw new PersistenceError('Recipe insert returned no row');
    }

    const body = recipeSchema.parse(toRecipe(row));
    return reply.code(201).send(body);
  });

  app.get('/recipes', async (_request, reply) => {
    const workspaceId = await resolveWorkspaceId(db);
    const rows = await db
      .select()
      .from(recipes)
      .where(eq(recipes.workspaceId, workspaceId));

    const body = recipeListSchema.parse(rows.map(toRecipe));
    return reply.code(200).send(body);
  });
}
