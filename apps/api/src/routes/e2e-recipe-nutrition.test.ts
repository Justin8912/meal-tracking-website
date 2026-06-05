import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import {
  computeRecipeNutrition,
  formatNutrition,
  type MacroKey,
  type NutritionLine,
} from '@meal-tracking/nutrition-engine';
import type { UsdaClient } from '../usda/client.js';
import type { NormalizedFood } from '../usda/mapper.js';

/**
 * STEP-44: end-to-end recipe -> nutrition flow (NFR-3, AC-3.2, AC-4.1).
 *
 * Bundles verify pieces; this proves the WIRED WHOLE: a recipe built from one
 * USDA-sourced ingredient (via the proxy) and one custom ingredient must persist
 * and reload with stable, correct combined nutrition through the real stack
 * (api -> drizzle -> postgres) computed by the SAME shared engine the web client
 * uses. This catches integration gaps (snapshot wiring, ingredient re-hydration,
 * engine inputs) that the per-route/component tests miss individually.
 *
 * Why an integration harness and not a browser e2e: the in-sandbox corporate TLS
 * proxy blocks Playwright browser downloads, so this runs the SERVER stack with
 * Supertest against a Dockerized postgres and drives the engine directly — the
 * exact code paths the SPA exercises (snapshot/create/save/reload). It skips with
 * a clear message when DATABASE_URL is absent, matching the repo's DB-skip
 * pattern and scripts/smoke.sh. Re-runs via `npm test` (DB-backed) or `npm run
 * e2e:recipe` against a running postgres.
 */

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

if (!TEST_DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.log(
    'SKIP e2e-recipe-nutrition: DATABASE_URL not set (start a postgres and export DATABASE_URL to run the round-trip).',
  );
}

async function applyMigration(file: string): Promise<void> {
  const { getPool } = await import('../db/client.js');
  const here = dirname(fileURLToPath(import.meta.url));
  const sqlText = await readFile(join(here, '..', '..', 'drizzle', file), 'utf8');
  await getPool().query(sqlText);
}

/**
 * A USDA food with COMPLETE macros (Foundation-style). The proxy snapshots its
 * per-100g nutrition into an owned ingredient.
 */
const USDA_FOOD: NormalizedFood = {
  fdcId: '170787',
  description: 'Oats, rolled, dry',
  dataType: 'SR Legacy',
  per100g: {
    calories: 389,
    proteinG: 16.9,
    carbsG: 66.3,
    fatG: 6.9,
    fiberG: 10.6,
    micronutrients: { Iron: { amount: 4.7, unit: 'mg' } },
  },
};

/** API ingredient nutrition shape (macros optional; absent = unknown, S-6). */
interface ApiNutrition {
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  micronutrients: Record<string, { amount: number; unit: string }>;
}
interface ApiIngredient {
  id: string;
  name: string;
  referenceGrams: number;
  gramWeightPerQty: number | null;
  unitGramEquivalents: Record<string, number>;
  nutrition: ApiNutrition;
}

/** Mirror the web client's absent-macro detection (query/ingredients.ts). */
function absentMacrosOf(n: ApiNutrition): MacroKey[] {
  const absent: MacroKey[] = [];
  if (n.calories === undefined) absent.push('calories');
  if (n.proteinG === undefined) absent.push('proteinG');
  if (n.carbsG === undefined) absent.push('carbsG');
  if (n.fatG === undefined) absent.push('fatG');
  if (n.fiberG === undefined) absent.push('fiberG');
  return absent;
}

/**
 * Reconstruct the engine lines exactly as the web editor would on reload: the
 * recipe detail gives (ingredientId, quantity, unitCode); the persisted
 * ingredient gives the per-referenceGrams nutrition + conversion data. This is
 * the integration contract under test (the detail endpoint carries usage, the
 * ingredient list carries nutrition; together they reproduce the totals).
 */
function buildEngineLines(
  recipeIngredients: Array<{ ingredientId: string; quantity: number; unitCode: string }>,
  byId: Map<string, ApiIngredient>,
): NutritionLine[] {
  return recipeIngredients.map((ri) => {
    const ing = byId.get(ri.ingredientId);
    if (!ing) throw new Error(`ingredient ${ri.ingredientId} not found on reload`);
    const n = ing.nutrition;
    return {
      quantity: ri.quantity,
      unitCode: ri.unitCode,
      ingredient: {
        id: ing.id,
        referenceGrams: ing.referenceGrams,
        gramEquivalents: ing.unitGramEquivalents,
        gramWeightPerQty: ing.gramWeightPerQty,
        absentMacros: absentMacrosOf(n),
        nutrition: {
          calories: n.calories ?? 0,
          proteinG: n.proteinG ?? 0,
          carbsG: n.carbsG ?? 0,
          fatG: n.fatG ?? 0,
          fiberG: n.fiberG ?? 0,
          micronutrients: n.micronutrients,
        },
      },
    };
  });
}

describeDb('STEP-44 end-to-end recipe -> nutrition (integration)', () => {
  let app: FastifyInstance;
  const getFood = vi.fn(async () => USDA_FOOD);

  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');
    const stub = { searchFoods: vi.fn(async () => [USDA_FOOD]), getFood } satisfies UsdaClient;
    const { buildServer } = await import('../server.js');
    app = await buildServer({ databaseUrl: TEST_DATABASE_URL!, usdaClient: stub });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    const { closeDb } = await import('../db/client.js');
    await closeDb();
  });

  beforeEach(async () => {
    // Isolate this suite's writes (recipes cascade to recipe_ingredients/tags).
    const { getDb } = await import('../db/client.js');
    await getDb().execute(sql`DELETE FROM recipes WHERE name LIKE 'E2E %'`);
    await getDb().execute(sql`DELETE FROM ingredients WHERE name LIKE 'E2E %' OR fdc_id = '170787'`);
    await getDb().execute(sql`DELETE FROM usda_food_cache`);
  });

  it('creates a recipe with a USDA + a custom ingredient, then reloads with stable combined nutrition', async () => {
    // 1. Search the USDA proxy (the only thing the browser talks to). Proves the
    //    proxy path is wired; the key is never echoed.
    const search = await request(app.server).get('/api/v1/ingredients/search?q=oats');
    expect(search.status).toBe(200);
    expect(search.body[0]).toMatchObject({ fdcId: '170787' });

    // 2. Snapshot the USDA food into an owned ingredient (confirm grams: a tbsp
    //    gram-equivalent so we can exercise a non-mass unit on the recipe line).
    const snap = await request(app.server)
      .post('/api/v1/ingredients/usda/170787')
      .send({ unitGramEquivalents: { cup: 81, tbsp: 5 } })
      .set('Content-Type', 'application/json');
    expect(snap.status).toBe(201);
    const usdaIngredientId = snap.body.id as string;

    // 3. Create a CUSTOM ingredient (AC-3.2) - protein powder, only some macros.
    const custom = await request(app.server)
      .post('/api/v1/ingredients')
      .send({
        name: 'E2E Protein Powder',
        referenceGrams: 100,
        calories: 375,
        proteinG: 80,
        carbsG: 8,
        fatG: 4,
        // fiber intentionally omitted -> must stay unknown (flagged, not 0).
      })
      .set('Content-Type', 'application/json');
    expect(custom.status).toBe(201);
    const customIngredientId = custom.body.id as string;
    expect(custom.body.nutrition.fiberG).toBeUndefined();

    // 4. Save a recipe referencing BOTH ingredients, mixed units, 2 servings.
    const recipeIngredients = [
      { ingredientId: usdaIngredientId, quantity: 150, unitCode: 'g' }, // oats 150 g
      { ingredientId: customIngredientId, quantity: 30, unitCode: 'g' }, // powder 30 g
    ];
    const created = await request(app.server)
      .post('/api/v1/recipes')
      .send({
        name: 'E2E Oatmeal Bowl',
        mealType: 'breakfast',
        servings: 2,
        ingredients: recipeIngredients,
        tags: ['high-protein'],
      })
      .set('Content-Type', 'application/json');
    expect(created.status).toBe(201);
    const recipeId = created.body.id as string;

    // 5. RELOAD from the library: GET the recipe detail (usage) + GET ingredients
    //    (nutrition), then recompute with the shared engine - exactly the web flow.
    const detail = await request(app.server).get(`/api/v1/recipes/${recipeId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.name).toBe('E2E Oatmeal Bowl');
    expect(detail.body.ingredients).toHaveLength(2);

    const list = await request(app.server).get('/api/v1/ingredients');
    expect(list.status).toBe(200);
    const byId = new Map<string, ApiIngredient>(
      (list.body as ApiIngredient[]).map((i) => [i.id, i]),
    );

    const engineLines = buildEngineLines(detail.body.ingredients, byId);
    const result = computeRecipeNutrition(engineLines, detail.body.servings);

    // Hand-verified combined nutrition:
    //   oats 150 g (factor 1.5): cal 583.5, p 25.35, c 99.45, f 10.35, fib 15.9
    //   powder 30 g (factor 0.3): cal 112.5, p 24,    c 2.4,   f 1.2,  fib (absent)
    //   total: cal 696, p 49.35, c 101.85, f 11.55, fib 15.9
    //   per serving (/2): cal 348, p 24.675, c 50.925, f 5.775, fib 7.95
    const total = formatNutrition(result.total);
    expect(Math.abs(total.calories - 696)).toBeLessThanOrEqual(1);
    expect(Math.abs(total.proteinG - 49.35)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(total.carbsG - 101.85)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(total.fatG - 11.55)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(total.fiberG - 15.9)).toBeLessThanOrEqual(0.5);

    const perServing = formatNutrition(result.perServing);
    expect(Math.abs(perServing.calories - 348)).toBeLessThanOrEqual(1);
    expect(Math.abs(perServing.proteinG - 24.675)).toBeLessThanOrEqual(0.5);

    // The custom ingredient contributes (AC-3.2): iron only comes from oats.
    expect(result.total.micronutrients.Iron?.amount).toBeCloseTo(7.05, 6);

    // Missing data is flagged, not zero-filled (S-6): the custom powder has no
    // fiber and no micronutrients -> the recipe is reported incomplete.
    expect(result.completeness.complete).toBe(false);
    const powderGaps = result.completeness.missing
      .filter((g) => g.ingredientId === customIngredientId)
      .map((g) => g.reason);
    expect(powderGaps.some((r) => /missing-macros/.test(r) && /fiberG/.test(r))).toBe(true);

    // 6. STABLE on a SECOND reload: re-fetch + recompute must match exactly.
    const detail2 = await request(app.server).get(`/api/v1/recipes/${recipeId}`);
    const list2 = await request(app.server).get('/api/v1/ingredients');
    const byId2 = new Map<string, ApiIngredient>(
      (list2.body as ApiIngredient[]).map((i) => [i.id, i]),
    );
    const result2 = computeRecipeNutrition(
      buildEngineLines(detail2.body.ingredients, byId2),
      detail2.body.servings,
    );
    expect(result2.total).toEqual(result.total);
    expect(result2.perServing).toEqual(result.perServing);
  });
});
