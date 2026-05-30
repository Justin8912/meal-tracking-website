import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { UsdaClient } from '../usda/client.js';
import type { NormalizedFood } from '../usda/mapper.js';
import { DEFAULT_WORKSPACE_ID } from '../constants.js';

/**
 * STEP-26 test-first for snapshot-at-add + gram resolution (STEP-27).
 *
 * Adding a USDA food to the workspace must snapshot its per-100g nutrition into
 * an OWNED ingredients row (source='usda', fdc_id set) so cache eviction never
 * rewrites historical recipes (F-11). The snapshot must be independent of the
 * cache: clearing usda_food_cache leaves the owned ingredient intact. Confirmed
 * gram-equivalents (gram_weight_per_qty, volume unit gram-equivalents) are
 * persisted for AC-4.5 conversion.
 *
 * Skips without DATABASE_URL.
 */

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

async function applyMigration(file: string): Promise<void> {
  const { getPool } = await import('../db/client.js');
  const here = dirname(fileURLToPath(import.meta.url));
  const sqlText = await readFile(
    join(here, '..', '..', 'drizzle', file),
    'utf8',
  );
  await getPool().query(sqlText);
}

const FOOD: NormalizedFood = {
  fdcId: '171705',
  description: 'Chicken breast, raw',
  dataType: 'SR Legacy',
  per100g: {
    calories: 120,
    proteinG: 22.5,
    fatG: 2.62,
    // no carbs/fiber -> must stay unknown on the snapshot (S-6)
    micronutrients: { Calcium: { amount: 5, unit: 'mg' } },
  },
};

describeDb('USDA snapshot-at-add (integration)', () => {
  let app: FastifyInstance;
  const getFood = vi.fn(async () => FOOD);

  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');
    const stub = { searchFoods: vi.fn(), getFood } satisfies UsdaClient;
    const { buildServer } = await import('../server.js');
    app = await buildServer({
      databaseUrl: TEST_DATABASE_URL!,
      usdaClient: stub,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    const { closeDb } = await import('../db/client.js');
    await closeDb();
  });

  beforeEach(async () => {
    const { getDb } = await import('../db/client.js');
    await getDb().execute(
      sql`DELETE FROM ingredients WHERE source = 'usda'`,
    );
    await getDb().execute(sql`DELETE FROM usda_food_cache`);
  });

  it('POST /ingredients/usda/:fdcId snapshots per-100g nutrition into an owned ingredient', async () => {
    const res = await request(app.server)
      .post('/api/v1/ingredients/usda/171705')
      .send({
        gramWeightPerQty: 174,
        unitGramEquivalents: { cup: 140 },
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      source: 'usda',
      fdcId: '171705',
      name: 'Chicken breast, raw',
      referenceGrams: 100,
      gramWeightPerQty: 174,
      unitGramEquivalents: { cup: 140 },
    });
    expect(res.body.nutrition.calories).toBe(120);
    expect(res.body.nutrition.proteinG).toBe(22.5);
    expect(res.body.nutrition.fatG).toBe(2.62);
    // carbs/fiber were absent in USDA -> absent in the snapshot (not zero, S-6)
    expect(res.body.nutrition.carbsG).toBeUndefined();
    expect(res.body.nutrition.fiberG).toBeUndefined();
    expect(res.body.nutrition.micronutrients.Calcium).toEqual({
      amount: 5,
      unit: 'mg',
    });

    const { getDb } = await import('../db/client.js');
    const row = await getDb().execute(
      sql`SELECT workspace_id, source, fdc_id FROM ingredients WHERE id = ${res.body.id}`,
    );
    expect(row.rows[0]).toMatchObject({
      workspace_id: DEFAULT_WORKSPACE_ID,
      source: 'usda',
      fdc_id: '171705',
    });
  });

  it('clearing usda_food_cache leaves the owned snapshot intact (F-11)', async () => {
    const created = await request(app.server)
      .post('/api/v1/ingredients/usda/171705')
      .send({})
      .set('Content-Type', 'application/json');
    expect(created.status).toBe(201);
    const ingredientId = created.body.id as string;

    const { getDb } = await import('../db/client.js');
    // Evict the entire accelerator cache.
    await getDb().execute(sql`DELETE FROM usda_food_cache`);

    // The owned ingredient (and its nutrition) is unchanged.
    const list = await request(app.server).get('/api/v1/ingredients');
    const found = (
      list.body as Array<{ id: string; nutrition: { calories?: number } }>
    ).find((i) => i.id === ingredientId);
    expect(found).toBeDefined();
    expect(found!.nutrition.calories).toBe(120);
  });

  it('gram-equivalents are persisted for unit conversion (AC-4.5)', async () => {
    const created = await request(app.server)
      .post('/api/v1/ingredients/usda/171705')
      .send({ gramWeightPerQty: 174, unitGramEquivalents: { cup: 140, tbsp: 8.75 } })
      .set('Content-Type', 'application/json');
    expect(created.status).toBe(201);

    const { getDb } = await import('../db/client.js');
    const row = await getDb().execute(
      sql`SELECT gram_weight_per_qty, unit_gram_equivalents
          FROM ingredients WHERE id = ${created.body.id}`,
    );
    expect(Number(row.rows[0]!.gram_weight_per_qty)).toBe(174);
    expect(row.rows[0]!.unit_gram_equivalents).toMatchObject({
      cup: 140,
      tbsp: 8.75,
    });
  });
});
