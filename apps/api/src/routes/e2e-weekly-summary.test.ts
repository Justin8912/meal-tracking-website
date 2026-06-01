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
import { weeklySummarySchema, type WeeklySummary } from '@meal-tracking/shared';
import { DEFAULT_WORKSPACE_ID } from '../constants.js';

/**
 * STEP-26: end-to-end weekly macro summary with exclusions (AC-5.1, AC-5.2; AD-6,
 * F-20).
 *
 * Proves, through the real stack (api -> drizzle -> postgres), that the weekly
 * summary aggregates MACROS ONLY from the week's RECIPE-based meals, computed via
 * the SAME shared nutrition-engine the web client uses on UNROUNDED per-serving
 * values (sum full precision, round once - F-20/S-5), and clearly FLAGS the
 * week's freeform meal as excluded (AC-5.2) with NO micronutrient aggregation
 * (AC-5.1). This is the end-to-end view of the summary the user sees: an accurate
 * macro total plus an explicit "what is not counted" - no silent zero-counting of
 * the freeform meal.
 *
 * Difference from plans-summary.test.ts (STEP-21): that file is the route's
 * test-first contract on a hand-seeded fixture; this is the bundle's end-to-end
 * VERIFICATION - it PLANS the week through POST /plans (recipe meals + a real
 * freeform meal), then reads GET /plans/summary, recomputing the expected total
 * with the shared engine to assert agreement, exactly the wired path.
 *
 * Why an integration harness and not a browser e2e: the in-sandbox corporate TLS
 * proxy blocks Playwright browser downloads (recipe-library Bundle 6's
 * constraint); the browser render of the summary is a documented manual/
 * Playwright check, while the WeeklyNutritionSummary component is covered by its
 * jsdom test. Skips without DATABASE_URL; re-runs via `npm test` / `npm run
 * e2e:planner`.
 */

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

if (!TEST_DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.log(
    'SKIP e2e-weekly-summary: DATABASE_URL not set (start a postgres and export DATABASE_URL to run the weekly-summary round-trip).',
  );
}

async function applyMigration(file: string): Promise<void> {
  const { getPool } = await import('../db/client.js');
  const here = dirname(fileURLToPath(import.meta.url));
  const sqlText = await readFile(join(here, '..', '..', 'drizzle', file), 'utf8');
  await getPool().query(sqlText);
}

const WEEK = '2026-10-05'; // a Monday

interface PlannedRecipe {
  id: string;
  servings: number;
  lines: NutritionLine[];
  entryId?: string;
}

describeDb('STEP-26 end-to-end weekly summary with exclusions (integration)', () => {
  let app: FastifyInstance | undefined;
  const recipes: PlannedRecipe[] = [];
  let freeformId: string;

  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');
    await applyMigration('0003_weekly_planner.sql');

    const { getDb } = await import('../db/client.js');
    const db = getDb();
    await db.execute(sql`DELETE FROM plan_entries WHERE week_start_date = ${WEEK}`);
    await db.execute(sql`DELETE FROM recipes WHERE name LIKE 'WS %'`);
    await db.execute(sql`DELETE FROM ingredients WHERE name LIKE 'WS %'`);

    // Two ingredients with full-precision per-100g macros, plus a micronutrient
    // (Iron) on the oats so we can assert micros are NOT aggregated weekly.
    const oats = await db.execute(
      sql`INSERT INTO ingredients (workspace_id, name, source, reference_grams, calories, protein_g, carbs_g, fat_g, fiber_g, micronutrients)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'WS Oats', 'custom', 100, 389, 16.9, 66.3, 6.9, 10.6, '{"Iron":{"amount":4.7,"unit":"mg"}}'::jsonb)
          RETURNING id`,
    );
    const oatsId = oats.rows[0]?.id as string;
    const chicken = await db.execute(
      sql`INSERT INTO ingredients (workspace_id, name, source, reference_grams, calories, protein_g, carbs_g, fat_g, fiber_g, micronutrients)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'WS Chicken', 'custom', 100, 165, 31, 0, 3.6, 0, '{}'::jsonb)
          RETURNING id`,
    );
    const chickenId = chicken.rows[0]?.id as string;

    // Recipe A (oats, 2 servings) and Recipe B (chicken, 3 servings). Quantities
    // chosen so per-serving values do not round cleanly (the F-20 guard matters).
    const recipeA = await db.execute(
      sql`INSERT INTO recipes (workspace_id, name, meal_type, servings)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'WS Recipe A', 'breakfast', 2) RETURNING id`,
    );
    const recipeAId = recipeA.rows[0]?.id as string;
    await db.execute(
      sql`INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit_code, position)
          VALUES (${recipeAId}, ${oatsId}, 137, 'g', 0)`,
    );
    const recipeB = await db.execute(
      sql`INSERT INTO recipes (workspace_id, name, meal_type, servings)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'WS Recipe B', 'dinner', 3) RETURNING id`,
    );
    const recipeBId = recipeB.rows[0]?.id as string;
    await db.execute(
      sql`INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit_code, position)
          VALUES (${recipeBId}, ${chickenId}, 410, 'g', 0)`,
    );

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
    const chickenIng = {
      id: chickenId,
      referenceGrams: 100,
      gramEquivalents: {},
      gramWeightPerQty: null,
      nutrition: {
        calories: 165,
        proteinG: 31,
        carbsG: 0,
        fatG: 3.6,
        fiberG: 0,
        micronutrients: {},
      },
    };
    recipes.push({
      id: recipeAId,
      servings: 2,
      lines: [{ quantity: 137, unitCode: 'g', ingredient: oatsIng }],
    });
    recipes.push({
      id: recipeBId,
      servings: 3,
      lines: [{ quantity: 410, unitCode: 'g', ingredient: chickenIng }],
    });

    const { buildServer } = await import('../server.js');
    app = await buildServer({ databaseUrl: TEST_DATABASE_URL! });
    await app.ready();

    // PLAN the week through POST /plans (the wired path): recipe A (Mon
    // breakfast), recipe B (Wed dinner), and one FREEFORM meal (Fri lunch).
    for (const [recipeId, dayOfWeek, mealSlot] of [
      [recipeAId, 0, 'breakfast'],
      [recipeBId, 2, 'dinner'],
    ] as const) {
      const res = await request(app.server)
        .post('/api/v1/plans')
        .send({ weekStart: WEEK, dayOfWeek, mealSlot, recipeId })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(201);
      const match = recipes.find((r) => r.id === recipeId);
      if (match) match.entryId = res.body.id as string;
    }

    const freeform = await request(app.server)
      .post('/api/v1/plans')
      .send({
        weekStart: WEEK,
        dayOfWeek: 4,
        mealSlot: 'lunch',
        freeformTitle: 'WS Leftover Pizza',
      })
      .set('Content-Type', 'application/json');
    expect(freeform.status).toBe(201);
    freeformId = freeform.body.id as string;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    const { closeDb } = await import('../db/client.js');
    await closeDb();
  });

  /** Sum UNROUNDED per-serving macros across the recipes, round ONCE (F-20). */
  function expectedTotals() {
    let calories = 0;
    let proteinG = 0;
    let carbsG = 0;
    let fatG = 0;
    let fiberG = 0;
    for (const r of recipes) {
      const ps = computeRecipeNutrition(r.lines, r.servings).perServing;
      calories += ps.calories;
      proteinG += ps.proteinG;
      carbsG += ps.carbsG;
      fatG += ps.fatG;
      fiberG += ps.fiberG;
    }
    return formatNutrition({ calories, proteinG, carbsG, fatG, fiberG, micronutrients: {} });
  }

  it('aggregates the week macro totals from the recipe meals via the shared engine (AC-5.1, F-20)', async () => {
    const res = await request(app!.server).get(
      `/api/v1/plans/summary?weekStart=${WEEK}`,
    );
    expect(res.status).toBe(200);
    // The response conforms to the shared summary contract.
    expect(weeklySummarySchema.safeParse(res.body).success).toBe(true);
    expect(res.body.weekStartDate).toBe(WEEK);

    const expected = expectedTotals();
    const totals = (res.body as WeeklySummary).totals;
    expect(Math.abs(totals.calories - expected.calories)).toBeLessThanOrEqual(1);
    expect(Math.abs(totals.proteinG - expected.proteinG)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(totals.carbsG - expected.carbsG)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(totals.fatG - expected.fatG)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(totals.fiberG - expected.fiberG)).toBeLessThanOrEqual(0.1);
  });

  it('does not aggregate micronutrients/%DV at the weekly level (AC-5.1)', async () => {
    const res = await request(app!.server).get(
      `/api/v1/plans/summary?weekStart=${WEEK}`,
    );
    expect(res.status).toBe(200);
    // Only the five macro keys; no micronutrient map - even though a counted
    // recipe (oats) carries Iron at the per-recipe level.
    expect(Object.keys(res.body.totals).sort()).toEqual(
      ['calories', 'carbsG', 'fatG', 'fiberG', 'proteinG'].sort(),
    );
    expect((res.body.totals as Record<string, unknown>).micronutrients).toBeUndefined();
  });

  it('flags the freeform meal as excluded and counts the recipe meals, never zero-counting freeform (AC-5.2)', async () => {
    const res = await request(app!.server).get(
      `/api/v1/plans/summary?weekStart=${WEEK}`,
    );
    expect(res.status).toBe(200);
    const summary = res.body as WeeklySummary;

    // The freeform meal is reported excluded (the user sees what is not counted).
    expect(summary.excludedEntryIds).toContain(freeformId);
    expect(summary.countedEntryIds).not.toContain(freeformId);

    // Both recipe meals are counted by their plan-entry id.
    for (const r of recipes) {
      expect(summary.countedEntryIds).toContain(r.entryId);
      expect(summary.excludedEntryIds).not.toContain(r.entryId);
    }
  });
});
