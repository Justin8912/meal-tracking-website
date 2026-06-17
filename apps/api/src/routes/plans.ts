import type { FastifyInstance } from 'fastify';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import { planEntryInputSchema, weeklySummarySchema } from '@meal-tracking/shared';
import type { Micronutrient, PlanEntry, WeeklySummary } from '@meal-tracking/shared';
import {
  computeRecipeNutrition,
  formatNutrition,
  type MacroKey,
  type Nutrition,
  type NutritionLine,
} from '@meal-tracking/nutrition-engine';
import type { Db } from '../db/client.js';
import {
  planEntries,
  recipes,
  recipeIngredients,
  ingredients,
  type PlanEntryRow,
  type IngredientRow,
} from '../db/schema.js';
import { PersistenceError } from '../db/persist.js';
import { resolveWorkspaceId } from '../workspace.js';

/**
 * Weekly-plan routes (FR-1, FR-3; AD-1..AD-4).
 *
 * Bundle 1 ships the thin add/list round-trip; full CRUD, navigation, the
 * detail view, and the weekly summary land in later bundles. Writes are scoped
 * to the workspace via resolveWorkspaceId() (platform AD-4), validated by the
 * shared Zod schema incl. the recipe/freeform XOR (S-1), and persisted via
 * parameterized Drizzle queries (S-2). weekStart is normalized to the Monday
 * DATE server-side (AD-2, S-4) so the query is robust to any in-week date and
 * there is no ISO/year-boundary bug.
 *
 * On any write failure a PersistenceError is thrown so the global handler emits
 * the shared 5xx envelope rather than a false success (AC-1.6).
 */

/** GET /plans query params: a required weekStart in YYYY-MM-DD form. */
const planQuerySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'weekStart must be YYYY-MM-DD'),
});

/**
 * Normalize any YYYY-MM-DD date to the Sunday DATE of its week (AD-2, S-4).
 *
 * The date is parsed at UTC midnight so the computation is timezone-independent
 * (a DATE has no time/zone); JS getUTCDay() returns 0 (Sunday)..6 (Saturday),
 * which maps directly to the days-since-Sunday offset. The result is
 * re-serialized as YYYY-MM-DD. This never produces a YYYY-Www string, so the
 * prototype's year-boundary bug (F-11) cannot occur.
 */
export function normalizeToSunday(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  const dow = d.getUTCDay(); // 0=Sunday..6=Saturday — offset is already days since Sunday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** Map a persisted plan-entry DB row to the shared PlanEntry response shape. */
function toPlanEntry(
  row: PlanEntryRow,
  recipeName?: string | null,
  ingredientName?: string | null,
): PlanEntry {
  return {
    id: row.id,
    weekStartDate: row.weekStartDate,
    dayOfWeek: row.dayOfWeek,
    mealSlot: row.mealSlot,
    position: row.position,
    recipeId: row.recipeId,
    recipeName: recipeName ?? undefined,
    freeformTitle: row.freeformTitle,
    freeformDescription: row.freeformDescription,
    freeformLink: row.freeformLink,
    ingredientId: row.ingredientId ?? null,
    ingredientName: ingredientName ?? undefined,
    ingredientQuantity:
      row.ingredientQuantity === null || row.ingredientQuantity === undefined
        ? null
        : Number(row.ingredientQuantity),
    ingredientUnitCode: row.ingredientUnitCode ?? null,
  };
}

/**
 * Which macros the persisted ingredient row did NOT provide (absent = unknown,
 * not zero - S-6). pg returns numerics as strings; a NULL column comes back as
 * `null`. Mirrors the web client's `absentMacrosOf` so the server feeds the
 * shared engine identical inputs and the weekly summary cannot drift from the
 * per-meal detail's nutrition (AD-4, AD-6).
 */
function absentMacrosOf(row: IngredientRow): MacroKey[] {
  const absent: MacroKey[] = [];
  if (row.calories === null) absent.push('calories');
  if (row.proteinG === null) absent.push('proteinG');
  if (row.carbsG === null) absent.push('carbsG');
  if (row.fatG === null) absent.push('fatG');
  if (row.fiberG === null) absent.push('fiberG');
  return absent;
}

/**
 * Build the engine `Nutrition` for an ingredient row. A NULL (absent) macro
 * column reads as 0 in the numeric accumulator, but `absentMacrosOf` records it
 * so the engine flags the line `missing-macros` rather than treating the
 * placeholder 0 as a real total (F-5, S-6). The micronutrient JSONB is carried
 * through as absolute mass (AD-1) - the weekly summary does not aggregate it.
 */
function toEngineNutrition(row: IngredientRow): Nutrition {
  return {
    calories: row.calories === null ? 0 : Number(row.calories),
    proteinG: row.proteinG === null ? 0 : Number(row.proteinG),
    carbsG: row.carbsG === null ? 0 : Number(row.carbsG),
    fatG: row.fatG === null ? 0 : Number(row.fatG),
    fiberG: row.fiberG === null ? 0 : Number(row.fiberG),
    micronutrients: row.micronutrients as Record<string, Micronutrient>,
  };
}

/** A zeroed macro accumulator (micronutrients are not aggregated weekly). */
function emptyMacroTotal(): Nutrition {
  return { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, micronutrients: {} };
}

/**
 * Compute the weekly macros summary for a normalized Monday DATE (FR-5, AD-6).
 *
 * Aggregates MACROS ONLY across the week's recipe-based plan entries. For each
 * recipe-backed entry it rebuilds the engine lines server-side exactly as the
 * web detail/editor does (recipe ingredient usage joined to the ingredient's
 * per-`referenceGrams` nutrition - AD-4), computes its per-serving nutrition via
 * the shared engine in FULL PRECISION, and sums those UNROUNDED per-serving
 * values across the week. Rounding happens ONCE at the end via `formatNutrition`
 * (the single rounding boundary) so error never compounds across meals (F-20,
 * S-5). Micronutrients/%DV are never aggregated (not summable across differing
 * reference amounts - AC-5.1).
 *
 * Freeform entries and recipe tombstones (recipe_id NULL) carry no nutrition;
 * their ids go to `excludedEntryIds` so the UI can state what is not counted,
 * never silently zero-counting them (AC-5.2). Recipe-based entries go to
 * `countedEntryIds`. A recipe-backed entry whose ingredients cannot be fully
 * computed still contributes its computable macros (the engine excludes only the
 * unresolvable lines, never zero-filling) and remains counted; weekly
 * completeness is out of scope for this Nice-to-Have (AC-5.1/5.2 only).
 */
async function computeWeeklySummary(
  db: Db,
  workspaceId: string,
  weekStartDate: string,
): Promise<WeeklySummary> {
  const entries = await db
    .select({
      id: planEntries.id,
      recipeId: planEntries.recipeId,
      ingredientId: planEntries.ingredientId,
      ingredientQuantity: planEntries.ingredientQuantity,
      ingredientUnitCode: planEntries.ingredientUnitCode,
    })
    .from(planEntries)
    .where(
      and(
        eq(planEntries.workspaceId, workspaceId),
        eq(planEntries.weekStartDate, weekStartDate),
      ),
    )
    .orderBy(asc(planEntries.dayOfWeek), asc(planEntries.position));

  const countedEntryIds: string[] = [];
  const excludedEntryIds: string[] = [];
  const recipeIdByEntry: Array<{ entryId: string; recipeId: string }> = [];
  const ingredientEntries: Array<{
    entryId: string;
    ingredientId: string;
    quantity: number;
    unitCode: string;
  }> = [];

  for (const entry of entries) {
    if (entry.ingredientId !== null && entry.ingredientId !== undefined) {
      countedEntryIds.push(entry.id);
      ingredientEntries.push({
        entryId: entry.id,
        ingredientId: entry.ingredientId,
        quantity: Number(entry.ingredientQuantity ?? 0),
        unitCode: entry.ingredientUnitCode ?? 'g',
      });
    } else if (entry.recipeId === null) {
      // Freeform meal OR recipe tombstone: no nutrition, flag as excluded.
      excludedEntryIds.push(entry.id);
    } else {
      countedEntryIds.push(entry.id);
      recipeIdByEntry.push({ entryId: entry.id, recipeId: entry.recipeId });
    }
  }

  const total = emptyMacroTotal();

  if (recipeIdByEntry.length > 0) {
    const recipeIds = Array.from(
      new Set(recipeIdByEntry.map((r) => r.recipeId)),
    );

    // Load the servings for every referenced recipe and the ingredient usage
    // joined to the ingredient's per-`referenceGrams` nutrition + conversion
    // data, all workspace-scoped. Parameterized Drizzle queries (S-4).
    const recipeRows = await db
      .select({ id: recipes.id, servings: recipes.servings })
      .from(recipes)
      .where(
        and(
          eq(recipes.workspaceId, workspaceId),
          inArray(recipes.id, recipeIds),
        ),
      );
    const servingsByRecipe = new Map(
      recipeRows.map((r) => [r.id, r.servings]),
    );

    const usageRows = await db
      .select({
        recipeId: recipeIngredients.recipeId,
        quantity: recipeIngredients.quantity,
        unitCode: recipeIngredients.unitCode,
        ingredient: ingredients,
      })
      .from(recipeIngredients)
      .innerJoin(
        ingredients,
        eq(recipeIngredients.ingredientId, ingredients.id),
      )
      .where(inArray(recipeIngredients.recipeId, recipeIds))
      .orderBy(asc(recipeIngredients.position));

    // Group the engine lines by recipe id.
    const linesByRecipe = new Map<string, NutritionLine[]>();
    for (const row of usageRows) {
      const list = linesByRecipe.get(row.recipeId) ?? [];
      list.push({
        quantity: Number(row.quantity),
        unitCode: row.unitCode,
        ingredient: {
          id: row.ingredient.id,
          referenceGrams: Number(row.ingredient.referenceGrams),
          gramEquivalents: row.ingredient.unitGramEquivalents,
          gramWeightPerQty:
            row.ingredient.gramWeightPerQty === null
              ? null
              : Number(row.ingredient.gramWeightPerQty),
          nutrition: toEngineNutrition(row.ingredient),
          absentMacros: absentMacrosOf(row.ingredient),
        },
      });
      linesByRecipe.set(row.recipeId, list);
    }

    // Per-serving nutrition per recipe is computed once (full precision) and
    // cached, then added once PER PLANNED ENTRY: the same recipe planned twice
    // in a week contributes twice. Sum the UNROUNDED per-serving macros (F-20).
    const perServingByRecipe = new Map<string, Nutrition>();
    for (const recipeId of recipeIds) {
      const lines = linesByRecipe.get(recipeId) ?? [];
      const servings = servingsByRecipe.get(recipeId) ?? 1;
      perServingByRecipe.set(
        recipeId,
        computeRecipeNutrition(lines, servings).perServing,
      );
    }

    for (const { recipeId } of recipeIdByEntry) {
      const perServing = perServingByRecipe.get(recipeId);
      if (!perServing) continue;
      total.calories += perServing.calories;
      total.proteinG += perServing.proteinG;
      total.carbsG += perServing.carbsG;
      total.fatG += perServing.fatG;
      total.fiberG += perServing.fiberG;
    }
  }

  // Ingredient-backed entries: compute nutrition directly from the ingredient row.
  if (ingredientEntries.length > 0) {
    const ingredientIds = Array.from(
      new Set(ingredientEntries.map((e) => e.ingredientId)),
    );
    const ingredientRows = await db
      .select()
      .from(ingredients)
      .where(
        and(
          eq(ingredients.workspaceId, workspaceId),
          inArray(ingredients.id, ingredientIds),
        ),
      );
    const ingredientById = new Map(ingredientRows.map((r) => [r.id, r]));

    for (const entry of ingredientEntries) {
      const ing = ingredientById.get(entry.ingredientId);
      if (!ing) continue;
      const line: NutritionLine = {
        quantity: entry.quantity,
        unitCode: entry.unitCode,
        ingredient: {
          id: ing.id,
          referenceGrams: Number(ing.referenceGrams),
          gramEquivalents: ing.unitGramEquivalents,
          gramWeightPerQty:
            ing.gramWeightPerQty === null ? null : Number(ing.gramWeightPerQty),
          nutrition: toEngineNutrition(ing),
          absentMacros: absentMacrosOf(ing),
        },
      };
      const nutrition = computeRecipeNutrition([line], 1).total;
      total.calories += nutrition.calories;
      total.proteinG += nutrition.proteinG;
      total.carbsG += nutrition.carbsG;
      total.fatG += nutrition.fatG;
      total.fiberG += nutrition.fiberG;
    }
  }

  // Round ONCE at the boundary (S-5); drop the micronutrient map - macros only.
  const rounded = formatNutrition(total);
  return {
    weekStartDate,
    totals: {
      calories: rounded.calories,
      proteinG: rounded.proteinG,
      carbsG: rounded.carbsG,
      fatG: rounded.fatG,
      fiberG: rounded.fiberG,
    },
    countedEntryIds,
    excludedEntryIds,
  };
}

export function registerPlansRoutes(app: FastifyInstance, db: Db): void {
  app.post('/plans', async (request, reply) => {
    const parsed = planEntryInputSchema.safeParse(request.body);
    if (!parsed.success) {
      // Surface validation failures (incl. the XOR) as a 400 envelope (S-1).
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid plan payload',
        },
      });
    }

    const input = parsed.data;
    const workspaceId = await resolveWorkspaceId(db);
    // Derive the Monday server-side from whatever in-week date was sent (AD-2).
    const weekStartDate = normalizeToSunday(input.weekStart);

    let createdId: string;
    try {
      const inserted = await db
        .insert(planEntries)
        .values({
          workspaceId,
          weekStartDate,
          dayOfWeek: input.dayOfWeek,
          mealSlot: input.mealSlot,
          position: input.position ?? 0,
          recipeId: input.recipeId ?? null,
          freeformTitle: input.freeformTitle ?? null,
          freeformDescription: input.freeformDescription ?? null,
          freeformLink: input.freeformLink ?? null,
          ingredientId: input.ingredientId ?? null,
          ingredientQuantity:
            input.ingredientQuantity !== undefined
              ? String(input.ingredientQuantity)
              : null,
          ingredientUnitCode: input.ingredientUnitCode ?? null,
        })
        .returning({ id: planEntries.id });
      const id = inserted[0]?.id;
      if (!id) {
        throw new PersistenceError('Plan entry insert returned no row');
      }
      createdId = id;
    } catch (err) {
      if (err instanceof PersistenceError) throw err;
      throw new PersistenceError('Failed to persist plan entry', { cause: err });
    }

    // Return the persisted row (read back), not the request echo, so the
    // response confirms persistence (incl. the normalized week_start_date).
    const rows = await db
      .select()
      .from(planEntries)
      .where(
        and(
          eq(planEntries.id, createdId),
          eq(planEntries.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PersistenceError('Plan entry vanished immediately after insert');
    }
    return reply.code(201).send(toPlanEntry(row));
  });

  app.put<{ Params: { id: string } }>('/plans/:id', async (request, reply) => {
    const parsed = planEntryInputSchema.safeParse(request.body);
    if (!parsed.success) {
      // Surface validation failures (incl. the XOR on edit) as a 400 envelope
      // (S-1) so a malformed edit is rejected before it reaches the DB.
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid plan payload',
        },
      });
    }

    const input = parsed.data;
    const id = request.params.id;
    const workspaceId = await resolveWorkspaceId(db);

    // Confirm the entry exists in this workspace before mutating (404 vs a
    // silent no-op update); the lookup is workspace-scoped (AD-4).
    const existing = await db
      .select({ id: planEntries.id })
      .from(planEntries)
      .where(and(eq(planEntries.id, id), eq(planEntries.workspaceId, workspaceId)))
      .limit(1);
    if (!existing[0]) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Plan entry not found' },
      });
    }

    // Derive the Monday server-side from whatever in-week date was sent (AD-2).
    const weekStartDate = normalizeToSunday(input.weekStart);

    try {
      // Exactly one of recipeId/freeformTitle/ingredientId is set; fully replace
      // all three sides so switching type clears the others.
      const updated = await db
        .update(planEntries)
        .set({
          weekStartDate,
          dayOfWeek: input.dayOfWeek,
          mealSlot: input.mealSlot,
          position: input.position ?? 0,
          recipeId: input.recipeId ?? null,
          freeformTitle: input.freeformTitle ?? null,
          freeformDescription: input.freeformDescription ?? null,
          freeformLink: input.freeformLink ?? null,
          ingredientId: input.ingredientId ?? null,
          ingredientQuantity:
            input.ingredientQuantity !== undefined
              ? String(input.ingredientQuantity)
              : null,
          ingredientUnitCode: input.ingredientUnitCode ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(planEntries.id, id), eq(planEntries.workspaceId, workspaceId)),
        )
        .returning({ id: planEntries.id });
      if (!updated[0]) {
        throw new PersistenceError('Plan entry update returned no row');
      }
    } catch (err) {
      if (err instanceof PersistenceError) throw err;
      throw new PersistenceError('Failed to update plan entry', { cause: err });
    }

    // Read the persisted row back so the response confirms persistence.
    const rows = await db
      .select()
      .from(planEntries)
      .where(
        and(eq(planEntries.id, id), eq(planEntries.workspaceId, workspaceId)),
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PersistenceError('Plan entry vanished immediately after update');
    }
    return reply.code(200).send(toPlanEntry(row));
  });

  app.delete<{ Params: { id: string } }>('/plans/:id', async (request, reply) => {
    const workspaceId = await resolveWorkspaceId(db);
    let deletedId: string | undefined;
    try {
      const deleted = await db
        .delete(planEntries)
        .where(
          and(
            eq(planEntries.id, request.params.id),
            eq(planEntries.workspaceId, workspaceId),
          ),
        )
        .returning({ id: planEntries.id });
      deletedId = deleted[0]?.id;
    } catch (err) {
      throw new PersistenceError('Failed to delete plan entry', { cause: err });
    }

    if (!deletedId) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Plan entry not found' },
      });
    }
    return reply.code(204).send();
  });

  // GET /plans/summary?weekStart= - the weekly macros summary (FR-5, AD-6).
  // Registered as its own literal path; there is no GET /plans/:id route, so no
  // wildcard collision. Macros only; freeform/tombstones flagged excluded.
  app.get('/plans/summary', async (request, reply) => {
    const parsedQuery = planQuerySchema.safeParse(request.query);
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
    // Normalize to the Monday so any in-week date returns the right week (AD-2).
    const weekStartDate = normalizeToSunday(parsedQuery.data.weekStart);

    const summary = await computeWeeklySummary(db, workspaceId, weekStartDate);
    // Validate the response against the shared schema before sending (S-1).
    const body = weeklySummarySchema.parse(summary);
    return reply.code(200).send(body);
  });

  // GET /plans/daily-summary?weekStart= — per-day macro breakdown.
  // Same engine computation as /plans/summary but grouped by day_of_week (0-6).
  app.get('/plans/daily-summary', async (request, reply) => {
    const parsedQuery = planQuerySchema.safeParse(request.query);
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
    const weekStartDate = normalizeToSunday(parsedQuery.data.weekStart);

    // Fetch all entries for the week including ingredient fields.
    const entries = await db
      .select({
        id: planEntries.id,
        dayOfWeek: planEntries.dayOfWeek,
        recipeId: planEntries.recipeId,
        freeformTitle: planEntries.freeformTitle,
        ingredientId: planEntries.ingredientId,
        ingredientQuantity: planEntries.ingredientQuantity,
        ingredientUnitCode: planEntries.ingredientUnitCode,
      })
      .from(planEntries)
      .where(
        and(
          eq(planEntries.workspaceId, workspaceId),
          eq(planEntries.weekStartDate, weekStartDate),
        ),
      )
      .orderBy(asc(planEntries.dayOfWeek), asc(planEntries.position));

    // Collect unique recipe ids.
    const recipeIdSet = new Set<string>();
    for (const e of entries) {
      if (e.recipeId) recipeIdSet.add(e.recipeId);
    }
    const recipeIds = [...recipeIdSet];

    // Load per-serving nutrition for every referenced recipe (same as weekly summary).
    const perServingByRecipe = new Map<string, Nutrition>();
    if (recipeIds.length > 0) {
      const recipeRows = await db
        .select({ id: recipes.id, servings: recipes.servings })
        .from(recipes)
        .where(and(eq(recipes.workspaceId, workspaceId), inArray(recipes.id, recipeIds)));
      const servingsByRecipe = new Map(recipeRows.map((r) => [r.id, r.servings]));

      const usageRows = await db
        .select({
          recipeId: recipeIngredients.recipeId,
          quantity: recipeIngredients.quantity,
          unitCode: recipeIngredients.unitCode,
          ingredient: ingredients,
        })
        .from(recipeIngredients)
        .innerJoin(ingredients, eq(recipeIngredients.ingredientId, ingredients.id))
        .where(inArray(recipeIngredients.recipeId, recipeIds))
        .orderBy(asc(recipeIngredients.position));

      const linesByRecipe = new Map<string, NutritionLine[]>();
      for (const row of usageRows) {
        const list = linesByRecipe.get(row.recipeId) ?? [];
        list.push({
          quantity: Number(row.quantity),
          unitCode: row.unitCode,
          ingredient: {
            id: row.ingredient.id,
            referenceGrams: Number(row.ingredient.referenceGrams),
            gramEquivalents: row.ingredient.unitGramEquivalents,
            gramWeightPerQty: row.ingredient.gramWeightPerQty === null ? null : Number(row.ingredient.gramWeightPerQty),
            nutrition: toEngineNutrition(row.ingredient),
            absentMacros: absentMacrosOf(row.ingredient),
          },
        });
        linesByRecipe.set(row.recipeId, list);
      }

      for (const rid of recipeIds) {
        const lines = linesByRecipe.get(rid) ?? [];
        const servings = servingsByRecipe.get(rid) ?? 1;
        perServingByRecipe.set(rid, computeRecipeNutrition(lines, servings).perServing);
      }
    }

    // Fetch ingredient rows needed for ingredient-backed entries.
    const ingredientIdSet = new Set<string>();
    for (const e of entries) {
      if (e.ingredientId) ingredientIdSet.add(e.ingredientId);
    }
    const ingredientById = new Map<string, IngredientRow>();
    if (ingredientIdSet.size > 0) {
      const ingRows = await db
        .select()
        .from(ingredients)
        .where(
          and(
            eq(ingredients.workspaceId, workspaceId),
            inArray(ingredients.id, [...ingredientIdSet]),
          ),
        );
      for (const r of ingRows) ingredientById.set(r.id, r);
    }

    // Accumulate per-day totals (unrounded), then round once at the boundary.
    const dayTotals: Array<Nutrition & { dayOfWeek: number; hasData: boolean }> = [];
    for (let d = 0; d < 7; d++) {
      dayTotals.push({ ...emptyMacroTotal(), micronutrients: {}, dayOfWeek: d, hasData: false });
    }
    for (const entry of entries) {
      const day = dayTotals[entry.dayOfWeek];
      if (!day) continue;

      if (entry.ingredientId) {
        const ing = ingredientById.get(entry.ingredientId);
        if (!ing) continue;
        const line: NutritionLine = {
          quantity: Number(entry.ingredientQuantity ?? 0),
          unitCode: entry.ingredientUnitCode ?? 'g',
          ingredient: {
            id: ing.id,
            referenceGrams: Number(ing.referenceGrams),
            gramEquivalents: ing.unitGramEquivalents,
            gramWeightPerQty: ing.gramWeightPerQty === null ? null : Number(ing.gramWeightPerQty),
            nutrition: toEngineNutrition(ing),
            absentMacros: absentMacrosOf(ing),
          },
        };
        const n = computeRecipeNutrition([line], 1).total;
        day.calories += n.calories;
        day.proteinG += n.proteinG;
        day.carbsG += n.carbsG;
        day.fatG += n.fatG;
        day.fiberG += n.fiberG;
        day.hasData = true;
      } else if (entry.recipeId) {
        const perServing = perServingByRecipe.get(entry.recipeId);
        if (!perServing) continue;
        day.calories += perServing.calories;
        day.proteinG += perServing.proteinG;
        day.carbsG += perServing.carbsG;
        day.fatG += perServing.fatG;
        day.fiberG += perServing.fiberG;
        day.hasData = true;
      }
    }

    const result = dayTotals.map((day) => {
      const rounded = formatNutrition(day);
      return {
        dayOfWeek: day.dayOfWeek,
        hasData: day.hasData,
        calories: rounded.calories,
        proteinG: rounded.proteinG,
        carbsG: rounded.carbsG,
        fatG: rounded.fatG,
        fiberG: rounded.fiberG,
      };
    });

    return reply.code(200).send(result);
  });

  app.get('/plans', async (request, reply) => {
    const parsedQuery = planQuerySchema.safeParse(request.query);
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
    // Normalize to the Monday so any in-week date returns the right week (AD-2).
    const weekStartDate = normalizeToSunday(parsedQuery.data.weekStart);

    // LEFT JOIN recipes and ingredients so every plan entry carries display names.
    const rows = await db
      .select({
        entry: planEntries,
        recipeName: recipes.name,
        ingredientName: ingredients.name,
      })
      .from(planEntries)
      .leftJoin(recipes, eq(planEntries.recipeId, recipes.id))
      .leftJoin(ingredients, eq(planEntries.ingredientId, ingredients.id))
      .where(
        and(
          eq(planEntries.workspaceId, workspaceId),
          eq(planEntries.weekStartDate, weekStartDate),
        ),
      )
      .orderBy(asc(planEntries.dayOfWeek), asc(planEntries.position));

    return reply.code(200).send(
      rows.map((r) => toPlanEntry(r.entry, r.recipeName, r.ingredientName)),
    );
  });

  // GET /plans/history?weekStart=YYYY-MM-DD&weeks=N
  // Returns N weekly macro totals (oldest → newest) ending at weekStart.
  // Single batch query across the full date range — never N round-trips.
  app.get('/plans/history', async (request, reply) => {
    const parsed = z
      .object({
        weekStart: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'weekStart must be YYYY-MM-DD'),
        weeks: z.coerce.number().int().min(1).max(52).default(8),
      })
      .safeParse(request.query);

    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid query parameters',
        },
      });
    }

    const { weekStart, weeks } = parsed.data;
    const anchor = normalizeToSunday(weekStart);
    const workspaceId = await resolveWorkspaceId(db);

    // Build the ordered list of weekStartDate strings (oldest → newest).
    const weekStarts: string[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date(`${anchor}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() - i * 7);
      weekStarts.push(d.toISOString().slice(0, 10));
    }
    const oldestWeek = weekStarts[0]!;

    // One query for all plan entries across the full date range.
    const inRange = await db
      .select({
        weekStartDate: planEntries.weekStartDate,
        dayOfWeek: planEntries.dayOfWeek,
        recipeId: planEntries.recipeId,
        ingredientId: planEntries.ingredientId,
        ingredientQuantity: planEntries.ingredientQuantity,
        ingredientUnitCode: planEntries.ingredientUnitCode,
      })
      .from(planEntries)
      .where(
        and(
          eq(planEntries.workspaceId, workspaceId),
          gte(planEntries.weekStartDate, oldestWeek),
          lte(planEntries.weekStartDate, anchor),
        ),
      );

    // Batch-load per-serving nutrition for all referenced recipes.
    const recipeIdSet = new Set(
      inRange.map((e) => e.recipeId).filter(Boolean) as string[],
    );
    const perServingByRecipe = new Map<string, Nutrition>();

    if (recipeIdSet.size > 0) {
      const recipeIds = [...recipeIdSet];
      const recipeRows = await db
        .select({ id: recipes.id, servings: recipes.servings })
        .from(recipes)
        .where(and(eq(recipes.workspaceId, workspaceId), inArray(recipes.id, recipeIds)));
      const servingsByRecipe = new Map(recipeRows.map((r) => [r.id, r.servings]));

      const usageRows = await db
        .select({
          recipeId: recipeIngredients.recipeId,
          quantity: recipeIngredients.quantity,
          unitCode: recipeIngredients.unitCode,
          ingredient: ingredients,
        })
        .from(recipeIngredients)
        .innerJoin(ingredients, eq(recipeIngredients.ingredientId, ingredients.id))
        .where(inArray(recipeIngredients.recipeId, recipeIds))
        .orderBy(asc(recipeIngredients.position));

      const linesByRecipe = new Map<string, NutritionLine[]>();
      for (const row of usageRows) {
        const list = linesByRecipe.get(row.recipeId) ?? [];
        list.push({
          quantity: Number(row.quantity),
          unitCode: row.unitCode,
          ingredient: {
            id: row.ingredient.id,
            referenceGrams: Number(row.ingredient.referenceGrams),
            gramEquivalents: row.ingredient.unitGramEquivalents,
            gramWeightPerQty:
              row.ingredient.gramWeightPerQty === null
                ? null
                : Number(row.ingredient.gramWeightPerQty),
            nutrition: toEngineNutrition(row.ingredient),
            absentMacros: absentMacrosOf(row.ingredient),
          },
        });
        linesByRecipe.set(row.recipeId, list);
      }

      for (const rid of recipeIds) {
        const lines = linesByRecipe.get(rid) ?? [];
        const servings = servingsByRecipe.get(rid) ?? 1;
        perServingByRecipe.set(rid, computeRecipeNutrition(lines, servings).perServing);
      }
    }

    // Batch-load ingredient rows for ingredient-backed entries.
    const ingIdSet = new Set(
      inRange.map((e) => e.ingredientId).filter(Boolean) as string[],
    );
    const ingredientById = new Map<string, IngredientRow>();
    if (ingIdSet.size > 0) {
      const ingRows = await db
        .select()
        .from(ingredients)
        .where(and(eq(ingredients.workspaceId, workspaceId), inArray(ingredients.id, [...ingIdSet])));
      for (const r of ingRows) ingredientById.set(r.id, r);
    }

    // Accumulate per-week totals and track distinct days that had nutrition data.
    const totalsMap = new Map<string, Nutrition & { hasData: boolean; daysWithData: Set<number> }>();
    for (const ws of weekStarts) {
      totalsMap.set(ws, { ...emptyMacroTotal(), micronutrients: {}, hasData: false, daysWithData: new Set() });
    }

    for (const entry of inRange) {
      const bucket = totalsMap.get(entry.weekStartDate);
      if (!bucket) continue;

      if (entry.ingredientId) {
        const ing = ingredientById.get(entry.ingredientId);
        if (!ing) continue;
        const line: NutritionLine = {
          quantity: Number(entry.ingredientQuantity ?? 0),
          unitCode: entry.ingredientUnitCode ?? 'g',
          ingredient: {
            id: ing.id,
            referenceGrams: Number(ing.referenceGrams),
            gramEquivalents: ing.unitGramEquivalents,
            gramWeightPerQty: ing.gramWeightPerQty === null ? null : Number(ing.gramWeightPerQty),
            nutrition: toEngineNutrition(ing),
            absentMacros: absentMacrosOf(ing),
          },
        };
        const n = computeRecipeNutrition([line], 1).total;
        bucket.calories += n.calories;
        bucket.proteinG += n.proteinG;
        bucket.carbsG += n.carbsG;
        bucket.fatG += n.fatG;
        bucket.fiberG += n.fiberG;
        bucket.hasData = true;
        bucket.daysWithData.add(entry.dayOfWeek);
      } else if (entry.recipeId) {
        const perServing = perServingByRecipe.get(entry.recipeId);
        if (!perServing) continue;
        bucket.calories += perServing.calories;
        bucket.proteinG += perServing.proteinG;
        bucket.carbsG += perServing.carbsG;
        bucket.fatG += perServing.fatG;
        bucket.fiberG += perServing.fiberG;
        bucket.hasData = true;
        bucket.daysWithData.add(entry.dayOfWeek);
      }
    }

    // Divide totals by days with data to produce per-day averages.
    const result = weekStarts.map((ws) => {
      const raw = totalsMap.get(ws)!;
      const divisor = Math.max(1, raw.daysWithData.size);
      const avg: Nutrition = {
        calories: raw.calories / divisor,
        proteinG: raw.proteinG / divisor,
        carbsG: raw.carbsG / divisor,
        fatG: raw.fatG / divisor,
        fiberG: raw.fiberG / divisor,
        micronutrients: {},
      };
      const rounded = formatNutrition(avg);
      return {
        weekStartDate: ws,
        calories: rounded.calories,
        proteinG: rounded.proteinG,
        carbsG: rounded.carbsG,
        fatG: rounded.fatG,
        fiberG: rounded.fiberG,
        hasData: raw.hasData,
      };
    });

    return reply.code(200).send(result);
  });
}
