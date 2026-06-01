import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import {
  computeRecipeNutrition,
  formatNutrition,
  type NutritionLine,
} from '@meal-tracking/nutrition-engine';
import { DEFAULT_WORKSPACE_ID } from '../constants.js';

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

if (!TEST_DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.log(
    'SKIP plans-summary: DATABASE_URL not set (start a postgres and export DATABASE_URL to run the summary round-trip).',
  );
}

/**
 * STEP-21 (test-first for STEP-22): the weekly nutrition summary endpoint,
 * GET /plans/summary?weekStart= (FR-5, AC-5.1/AC-5.2; AD-6).
 *
 * The summary aggregates MACROS ONLY across the week's recipe-based entries,
 * computed server-side via the shared nutrition-engine on UNROUNDED per-serving
 * values (sum full precision, round only at display via formatNutrition - F-20,
 * S-5). It must:
 *   * sum the per-serving macros of every recipe-based entry in the week, with
 *     the total matching a hand-computed expected (built the SAME way the
 *     engine builds it: usage joined to ingredient nutrition, unrounded, summed,
 *     rounded once) - never by adding pre-rounded per-recipe displays;
 *   * NOT aggregate micronutrients/%DV at the weekly level (AC-5.1) - the
 *     response carries no micronutrient map on the totals;
 *   * flag freeform meals and recipe tombstones as EXCLUDED (in excludedEntryIds),
 *     never silently zero-counting them (AC-5.2); recipe-based entries appear in
 *     countedEntryIds.
 *
 * Fails before STEP-22 (the endpoint is not implemented -> the not-found handler
 * returns a non-200, so the assertions on the summary body fail).
 */
async function applyMigration(file: string): Promise<void> {
  const { getPool } = await import('../db/client.js');
  const here = dirname(fileURLToPath(import.meta.url));
  const sqlText = await readFile(
    join(here, '..', '..', 'drizzle', file),
    'utf8',
  );
  await getPool().query(sqlText);
}

const WEEK = '2026-06-08'; // a Monday
const OTHER_WEEK = '2026-06-15';

interface CreatedRecipe {
  id: string;
  servings: number;
  /** Engine lines for this recipe (usage joined to ingredient nutrition). */
  lines: NutritionLine[];
}

describeDb('GET /plans/summary weekly macro aggregation (integration)', () => {
  let app: FastifyInstance | undefined;
  const recipes: CreatedRecipe[] = [];
  let freeformId: string;
  let tombstoneId: string;

  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');
    await applyMigration('0003_weekly_planner.sql');

    const { getDb } = await import('../db/client.js');
    const db = getDb();

    // Isolate this suite's data.
    await db.execute(sql`DELETE FROM plan_entries WHERE week_start_date IN (${WEEK}, ${OTHER_WEEK})`);
    await db.execute(sql`DELETE FROM recipes WHERE name LIKE 'SUMTEST %'`);
    await db.execute(sql`DELETE FROM ingredients WHERE name LIKE 'SUMTEST %'`);

    // Two ingredients with full-precision per-100g macros. Macros chosen so the
    // per-serving values do NOT round cleanly, so summing pre-rounded values
    // would diverge from summing unrounded values (the F-20 guard).
    const oats = await db.execute(
      sql`INSERT INTO ingredients (workspace_id, name, source, reference_grams, calories, protein_g, carbs_g, fat_g, fiber_g, micronutrients)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'SUMTEST Oats', 'custom', 100, 389, 16.9, 66.3, 6.9, 10.6, '{"Iron":{"amount":4.7,"unit":"mg"}}'::jsonb)
          RETURNING id`,
    );
    const oatsId = oats.rows[0]?.id as string;

    const powder = await db.execute(
      sql`INSERT INTO ingredients (workspace_id, name, source, reference_grams, calories, protein_g, carbs_g, fat_g, fiber_g, micronutrients)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'SUMTEST Powder', 'custom', 100, 375, 80, 8, 4, 3, '{}'::jsonb)
          RETURNING id`,
    );
    const powderId = powder.rows[0]?.id as string;

    // Recipe A: 3 servings, oats 175g + powder 35g (factors 1.75 / 0.35).
    const recipeA = await db.execute(
      sql`INSERT INTO recipes (workspace_id, name, meal_type, servings)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'SUMTEST Recipe A', 'breakfast', 3) RETURNING id`,
    );
    const recipeAId = recipeA.rows[0]?.id as string;
    await db.execute(
      sql`INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit_code, position)
          VALUES (${recipeAId}, ${oatsId}, 175, 'g', 0), (${recipeAId}, ${powderId}, 35, 'g', 1)`,
    );

    // Recipe B: 2 servings, oats 90g (factor 0.9).
    const recipeB = await db.execute(
      sql`INSERT INTO recipes (workspace_id, name, meal_type, servings)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'SUMTEST Recipe B', 'dinner', 2) RETURNING id`,
    );
    const recipeBId = recipeB.rows[0]?.id as string;
    await db.execute(
      sql`INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit_code, position)
          VALUES (${recipeBId}, ${oatsId}, 90, 'g', 0)`,
    );

    // Recipe C is created then DELETED so its plan entry becomes a tombstone
    // (recipe_id SET NULL): it must be EXCLUDED, not zero-counted.
    const recipeC = await db.execute(
      sql`INSERT INTO recipes (workspace_id, name, meal_type, servings)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'SUMTEST Recipe C', 'lunch', 1) RETURNING id`,
    );
    const recipeCId = recipeC.rows[0]?.id as string;

    // Engine ingredient shapes for the hand-computed expectation.
    const oatsIng = {
      id: oatsId,
      referenceGrams: 100,
      gramEquivalents: {},
      gramWeightPerQty: null,
      nutrition: {
        calories: 389,
        proteinG: 16.9,
        carbsG: 66.3,
        fatG: 6.9,
        fiberG: 10.6,
        micronutrients: { Iron: { amount: 4.7, unit: 'mg' } },
      },
    };
    const powderIng = {
      id: powderId,
      referenceGrams: 100,
      gramEquivalents: {},
      gramWeightPerQty: null,
      nutrition: {
        calories: 375,
        proteinG: 80,
        carbsG: 8,
        fatG: 4,
        fiberG: 3,
        micronutrients: {},
      },
    };

    recipes.push({
      id: recipeAId,
      servings: 3,
      lines: [
        { quantity: 175, unitCode: 'g', ingredient: oatsIng },
        { quantity: 35, unitCode: 'g', ingredient: powderIng },
      ],
    });
    recipes.push({
      id: recipeBId,
      servings: 2,
      lines: [{ quantity: 90, unitCode: 'g', ingredient: oatsIng }],
    });

    const { buildServer } = await import('../server.js');
    app = await buildServer({ databaseUrl: TEST_DATABASE_URL! });
    await app.ready();

    // Plan the week: recipe A (Mon breakfast), recipe B (Tue dinner), recipe C
    // (Wed lunch), one freeform (Thu lunch). Plus a recipe A in OTHER_WEEK that
    // must NOT leak into this week's totals.
    for (const [recipeId, dayOfWeek, mealSlot] of [
      [recipeAId, 0, 'breakfast'],
      [recipeBId, 1, 'dinner'],
      [recipeCId, 2, 'lunch'],
    ] as const) {
      const res = await request(app.server)
        .post('/api/v1/plans')
        .send({ weekStart: WEEK, dayOfWeek, mealSlot, recipeId })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(201);
      if (recipeId === recipeCId) {
        tombstoneId = res.body.id as string;
      }
    }

    const freeform = await request(app.server)
      .post('/api/v1/plans')
      .send({
        weekStart: WEEK,
        dayOfWeek: 3,
        mealSlot: 'lunch',
        freeformTitle: 'SUMTEST Leftover Pizza',
      })
      .set('Content-Type', 'application/json');
    expect(freeform.status).toBe(201);
    freeformId = freeform.body.id as string;

    const other = await request(app.server)
      .post('/api/v1/plans')
      .send({ weekStart: OTHER_WEEK, dayOfWeek: 0, mealSlot: 'breakfast', recipeId: recipeAId })
      .set('Content-Type', 'application/json');
    expect(other.status).toBe(201);

    // Delete recipe C -> its plan entry becomes a tombstone (recipe_id NULL).
    await db.execute(sql`DELETE FROM recipes WHERE id = ${recipeCId}`);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    const { closeDb } = await import('../db/client.js');
    await closeDb();
  });

  /**
   * Hand-compute the expected week totals exactly as the engine must: per recipe,
   * compute UNROUNDED per-serving macros via the shared engine, sum the unrounded
   * per-serving values across recipes, then round ONCE via formatNutrition. This
   * never adds pre-rounded per-recipe displays (the F-20 guard).
   */
  function expectedTotals() {
    let calories = 0;
    let proteinG = 0;
    let carbsG = 0;
    let fatG = 0;
    let fiberG = 0;
    for (const r of recipes) {
      const perServing = computeRecipeNutrition(r.lines, r.servings).perServing;
      calories += perServing.calories;
      proteinG += perServing.proteinG;
      carbsG += perServing.carbsG;
      fatG += perServing.fatG;
      fiberG += perServing.fiberG;
    }
    return formatNutrition({ calories, proteinG, carbsG, fatG, fiberG, micronutrients: {} });
  }

  it('aggregates macro totals from unrounded per-serving values within tolerance (AC-5.1, F-20)', async () => {
    const res = await request(app!.server).get(
      `/api/v1/plans/summary?weekStart=${WEEK}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.weekStartDate).toBe(WEEK);

    const expected = expectedTotals();
    const totals = res.body.totals as Record<string, number>;
    expect(Math.abs(totals.calories - expected.calories)).toBeLessThanOrEqual(1);
    expect(Math.abs(totals.proteinG - expected.proteinG)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(totals.carbsG - expected.carbsG)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(totals.fatG - expected.fatG)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(totals.fiberG - expected.fiberG)).toBeLessThanOrEqual(0.1);
  });

  it('matches the unrounded sum, not a sum of pre-rounded per-recipe values (F-20)', async () => {
    const res = await request(app!.server).get(
      `/api/v1/plans/summary?weekStart=${WEEK}`,
    );
    expect(res.status).toBe(200);

    // Sum of UNROUNDED per-serving, rounded once (correct).
    const correct = expectedTotals();
    // Sum of PRE-ROUNDED per-serving displays (the wrong way - compounds error).
    let preRounded = 0;
    for (const r of recipes) {
      preRounded += formatNutrition(
        computeRecipeNutrition(r.lines, r.servings).perServing,
      ).proteinG;
    }
    preRounded = Number(preRounded.toFixed(1));

    // The two methods must actually differ for this fixture, otherwise the test
    // would not prove unrounded summation.
    expect(preRounded).not.toBe(correct.proteinG);
    // The endpoint must use the correct (unrounded-sum) value.
    expect((res.body.totals as Record<string, number>).proteinG).toBe(
      correct.proteinG,
    );
  });

  it('does not aggregate micronutrients/%DV at the weekly level (AC-5.1)', async () => {
    const res = await request(app!.server).get(
      `/api/v1/plans/summary?weekStart=${WEEK}`,
    );
    expect(res.status).toBe(200);
    // totals carry the five macros only - no micronutrient map.
    expect(Object.keys(res.body.totals).sort()).toEqual(
      ['calories', 'carbsG', 'fatG', 'fiberG', 'proteinG'].sort(),
    );
    expect(res.body.totals.micronutrients).toBeUndefined();
  });

  it('flags the freeform meal and the tombstone as excluded, never zero-counting them (AC-5.2)', async () => {
    const res = await request(app!.server).get(
      `/api/v1/plans/summary?weekStart=${WEEK}`,
    );
    expect(res.status).toBe(200);

    const excluded = res.body.excludedEntryIds as string[];
    const counted = res.body.countedEntryIds as string[];

    expect(excluded).toContain(freeformId);
    expect(excluded).toContain(tombstoneId);
    // Recipe-based entries are counted, not excluded.
    for (const r of recipes) {
      expect(counted).toContain(r.id);
      expect(excluded).not.toContain(r.id);
    }
    // The freeform/tombstone are not in the counted set.
    expect(counted).not.toContain(freeformId);
    expect(counted).not.toContain(tombstoneId);
  });

  it('normalizes any in-week date to the Monday and rejects a malformed weekStart', async () => {
    // A mid-week date returns the same week's summary (AD-2).
    const mid = await request(app!.server).get(
      `/api/v1/plans/summary?weekStart=2026-06-10`,
    );
    expect(mid.status).toBe(200);
    expect(mid.body.weekStartDate).toBe(WEEK);

    const bad = await request(app!.server).get(
      `/api/v1/plans/summary?weekStart=not-a-date`,
    );
    expect(bad.status).toBe(400);
    expect(bad.body.error?.code).toBe('VALIDATION_ERROR');
  });
});
