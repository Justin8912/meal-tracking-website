import type { FastifyInstance } from 'fastify';
import { and, asc, eq, ilike, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  recipeInputSchema,
  recipeSchema,
  recipeDetailSchema,
  mealTypeSchema,
} from '@meal-tracking/shared';
import type { Recipe, RecipeInput } from '@meal-tracking/shared';
import type { Db } from '../db/client.js';
import {
  recipes,
  recipeIngredients,
  recipeTags,
  ingredients,
  tags,
  type RecipeRow,
} from '../db/schema.js';
import { PersistenceError } from '../db/persist.js';
import { upsertTagsByLabel } from './tags.js';
import { resolveWorkspaceId } from '../workspace.js';

/**
 * Recipe routes (FR-1, FR-5, FR-6; AD-2, AD-6).
 *
 * Bundle 1 shipped the thin create/list round-trip. Bundle 4 (STEP-29/31/33/35)
 * extends it to full CRUD, tag application, server-side tag/meal-type filtering,
 * and name search. All filters/search are parameterized Drizzle conditions
 * (S-4) - user input is never concatenated into SQL.
 *
 * On any write failure a PersistenceError is thrown so the global handler emits
 * the shared 5xx envelope rather than a false success (AC-1.5, AC-1.6). The
 * write side (create/update of a recipe with its ingredients and tags) runs in
 * a transaction so a partial write cannot leave the prior state half-replaced.
 */

const recipeListSchema = z.array(recipeSchema);

/**
 * Coerce an absent or blank query param to undefined so empty filters are
 * ignored rather than treated as a value (AD-6). Non-string inputs (e.g.
 * repeated params parsed to arrays) are rejected by the field schema.
 */
const blankToUndefined = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().optional(),
);

/** GET /recipes query params: optional text search and filters (AD-6). */
const recipeQuerySchema = z.object({
  q: blankToUndefined,
  // Empty mealType is ignored; a non-empty value must be one of the four slots.
  mealType: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    mealTypeSchema.optional(),
  ),
  tag: blankToUndefined,
});

/** Map a persisted recipe DB row to the shared core Recipe response shape. */
function toRecipe(row: RecipeRow, recipeTags: string[] = []): Recipe {
  return {
    id: row.id,
    name: row.name,
    mealType: row.mealType,
    servings: row.servings,
    notes: row.notes,
    sourceLink: row.sourceLink,
    tags: recipeTags,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Write a recipe's ingredient lines and tag links inside an existing
 * transaction. Used by both create and update; on update the caller has already
 * cleared the prior join rows so this fully replaces them. All inserts are
 * parameterized (S-4).
 */
async function writeRecipeAssociations(
  tx: Db,
  workspaceId: string,
  recipeId: string,
  input: RecipeInput,
): Promise<void> {
  if (input.ingredients.length > 0) {
    await tx.insert(recipeIngredients).values(
      input.ingredients.map((line, index) => ({
        recipeId,
        ingredientId: line.ingredientId,
        quantity: String(line.quantity),
        unitCode: line.unitCode,
        position: index,
      })),
    );
  }

  const labels = input.tags ?? [];
  if (labels.length > 0) {
    const tagRows = await upsertTagsByLabel(tx, workspaceId, labels);
    if (tagRows.length > 0) {
      await tx
        .insert(recipeTags)
        .values(tagRows.map((t) => ({ recipeId, tagId: t.id })))
        .onConflictDoNothing();
    }
  }
}

/**
 * Load a recipe (workspace-scoped) with its hydrated ingredient lines and tag
 * labels. Returns undefined when the recipe does not exist in the workspace.
 */
async function loadRecipeDetail(
  db: Db,
  workspaceId: string,
  id: string,
): Promise<z.infer<typeof recipeDetailSchema> | undefined> {
  const rows = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.workspaceId, workspaceId)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return undefined;
  }

  const lineRows = await db
    .select({
      ingredientId: recipeIngredients.ingredientId,
      name: ingredients.name,
      quantity: recipeIngredients.quantity,
      unitCode: recipeIngredients.unitCode,
    })
    .from(recipeIngredients)
    .innerJoin(ingredients, eq(recipeIngredients.ingredientId, ingredients.id))
    .where(eq(recipeIngredients.recipeId, id))
    .orderBy(asc(recipeIngredients.position));

  const tagRows = await db
    .select({ label: tags.label })
    .from(recipeTags)
    .innerJoin(tags, eq(recipeTags.tagId, tags.id))
    .where(eq(recipeTags.recipeId, id));

  return recipeDetailSchema.parse({
    ...toRecipe(row),
    ingredients: lineRows.map((l) => ({
      ingredientId: l.ingredientId,
      name: l.name,
      quantity: Number(l.quantity),
      unitCode: l.unitCode,
    })),
    tags: tagRows.map((t) => t.label),
  });
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

    let createdId: string;
    try {
      createdId = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(recipes)
          .values({
            workspaceId,
            name: input.name,
            mealType: input.mealType,
            servings: input.servings,
            notes: input.notes ?? null,
            sourceLink: input.sourceLink ?? null,
          })
          .returning({ id: recipes.id });
        const id = inserted[0]?.id;
        if (!id) {
          throw new PersistenceError('Recipe insert returned no row');
        }
        await writeRecipeAssociations(tx, workspaceId, id, input);
        return id;
      });
    } catch (err) {
      if (err instanceof PersistenceError) throw err;
      // Never swallow a write failure or report a false success (AC-1.5/1.6);
      // the global handler serializes this into the shared 5xx envelope.
      throw new PersistenceError('Failed to persist recipe', { cause: err });
    }

    const detail = await loadRecipeDetail(db, workspaceId, createdId);
    if (!detail) {
      throw new PersistenceError('Recipe vanished immediately after insert');
    }
    return reply.code(201).send(detail);
  });

  app.get('/recipes', async (request, reply) => {
    const parsedQuery = recipeQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message:
            parsedQuery.error.issues[0]?.message ?? 'Invalid query parameters',
        },
      });
    }

    const workspaceId = await resolveWorkspaceId(db);
    const { q, mealType, tag } = parsedQuery.data;

    // All conditions are parameterized Drizzle expressions (S-4) combined with
    // AND; empty/whitespace params are ignored (AD-6).
    // isNull(recipes.deletedAt): the list only shows live recipes; soft-deleted
    // recipes are excluded here but remain resolvable via GET /recipes/:id so
    // the planner can still show name + nutrition for historical plan entries.
    const conditions = [
      eq(recipes.workspaceId, workspaceId),
      isNull(recipes.deletedAt),
    ];

    if (mealType) {
      conditions.push(eq(recipes.mealType, mealType));
    }

    const trimmedQ = q?.trim();
    if (trimmedQ) {
      // Case-insensitive partial name match. The user value is bound as a
      // parameter; only the surrounding % wildcards are literal (S-4).
      conditions.push(ilike(recipes.name, `%${trimmedQ}%`));
    }

    const trimmedTag = tag?.trim();
    if (trimmedTag) {
      // Restrict to recipes that have a matching tag label. The tag value is a
      // bound parameter (parameterized subquery), so SQL metacharacters in the
      // label are treated literally, never as SQL (S-4).
      const taggedRecipeIds = db
        .select({ id: recipeTags.recipeId })
        .from(recipeTags)
        .innerJoin(tags, eq(recipeTags.tagId, tags.id))
        .where(
          and(eq(tags.workspaceId, workspaceId), eq(tags.label, trimmedTag)),
        );
      conditions.push(inArray(recipes.id, taggedRecipeIds));
    }

    const rows = await db
      .select()
      .from(recipes)
      .where(and(...conditions))
      .orderBy(asc(recipes.createdAt));

    // Batch-fetch all tags for the returned recipes in one query, then group
    // by recipe id so each recipe gets its tag labels without N+1 queries.
    const ids = rows.map((r) => r.id);
    const listTagRows = ids.length > 0
      ? await db
          .select({ recipeId: recipeTags.recipeId, label: tags.label })
          .from(recipeTags)
          .innerJoin(tags, eq(recipeTags.tagId, tags.id))
          .where(inArray(recipeTags.recipeId, ids))
      : [];
    const tagsByRecipe = new Map<string, string[]>();
    for (const t of listTagRows) {
      const list = tagsByRecipe.get(t.recipeId) ?? [];
      list.push(t.label);
      tagsByRecipe.set(t.recipeId, list);
    }

    const body = recipeListSchema.parse(
      rows.map((r) => toRecipe(r, tagsByRecipe.get(r.id) ?? [])),
    );
    return reply.code(200).send(body);
  });

  app.get<{ Params: { id: string } }>('/recipes/:id', async (request, reply) => {
    const workspaceId = await resolveWorkspaceId(db);
    const detail = await loadRecipeDetail(db, workspaceId, request.params.id);
    if (!detail) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Recipe not found' },
      });
    }
    return reply.code(200).send(detail);
  });

  app.put<{ Params: { id: string } }>('/recipes/:id', async (request, reply) => {
    const parsed = recipeInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid recipe payload',
        },
      });
    }

    const input = parsed.data;
    const id = request.params.id;
    const workspaceId = await resolveWorkspaceId(db);

    // Confirm the recipe exists in this workspace before mutating (404 vs a
    // silent no-op update).
    const existing = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.id, id), eq(recipes.workspaceId, workspaceId)))
      .limit(1);
    if (!existing[0]) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Recipe not found' },
      });
    }

    try {
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(recipes)
          .set({
            name: input.name,
            mealType: input.mealType,
            servings: input.servings,
            notes: input.notes ?? null,
            sourceLink: input.sourceLink ?? null,
            updatedAt: new Date(),
          })
          .where(
            and(eq(recipes.id, id), eq(recipes.workspaceId, workspaceId)),
          )
          .returning({ id: recipes.id });
        if (!updated[0]) {
          throw new PersistenceError('Recipe update returned no row');
        }
        // Fully replace the association rows so the update is the source of
        // truth for ingredients and tags.
        await tx
          .delete(recipeIngredients)
          .where(eq(recipeIngredients.recipeId, id));
        await tx.delete(recipeTags).where(eq(recipeTags.recipeId, id));
        await writeRecipeAssociations(tx, workspaceId, id, input);
      });
    } catch (err) {
      if (err instanceof PersistenceError) throw err;
      throw new PersistenceError('Failed to update recipe', { cause: err });
    }

    const detail = await loadRecipeDetail(db, workspaceId, id);
    if (!detail) {
      throw new PersistenceError('Recipe vanished immediately after update');
    }
    return reply.code(200).send(detail);
  });

  app.delete<{ Params: { id: string } }>(
    '/recipes/:id',
    async (request, reply) => {
      const workspaceId = await resolveWorkspaceId(db);
      // Soft delete: stamp deleted_at rather than removing the row. This keeps
      // plan_entries.recipe_id intact so the weekly planner can still resolve
      // the recipe name and compute nutrition for historical weeks. The recipe
      // disappears from GET /recipes (which filters deleted_at IS NULL) but
      // remains resolvable via GET /recipes/:id for plan detail / nutrition.
      let updatedId: string | undefined;
      try {
        const updated = await db
          .update(recipes)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(recipes.id, request.params.id),
              eq(recipes.workspaceId, workspaceId),
              isNull(recipes.deletedAt), // idempotent: already-deleted → 404
            ),
          )
          .returning({ id: recipes.id });
        updatedId = updated[0]?.id;
      } catch (err) {
        throw new PersistenceError('Failed to delete recipe', { cause: err });
      }

      if (!updatedId) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Recipe not found' },
        });
      }
      return reply.code(204).send();
    },
  );
}
