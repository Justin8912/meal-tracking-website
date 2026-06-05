import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { UsdaError, type UsdaClient } from '../usda/client.js';
import { createCachedUsdaClient } from '../usda/cache.js';
import type { NormalizedFood } from '../usda/mapper.js';

/**
 * STEP-45: USDA-degradation end-to-end (AC-2.3, NFR-5).
 *
 * AC-2.3 must hold under a REAL outage exercised through the cache-aside layer,
 * not just a stubbed unit. With USDA forced unreachable:
 *   - a search with a COLD cache shows a clear error envelope (the UI steers to
 *     custom entry), and
 *   - the custom-ingredient path still works (the user is never blocked), and
 *   - a previously-CACHED lookup still resolves from cache during the outage
 *     (stale-on-failure, F-9) - the reliability guarantee (NFR-5).
 *
 * This wires the production cache-aside client (createCachedUsdaClient) over a
 * TOGGLABLE inner stub so the upstream can be flipped from healthy to
 * unreachable mid-test, against a real Dockerized postgres cache. Skips with a
 * clear message without DATABASE_URL. Re-runs via `npm run e2e:recipe`.
 */

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

if (!TEST_DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.log(
    'SKIP e2e-usda-degradation: DATABASE_URL not set (start a postgres and export DATABASE_URL to run the outage path).',
  );
}

async function applyMigration(file: string): Promise<void> {
  const { getPool } = await import('../db/client.js');
  const here = dirname(fileURLToPath(import.meta.url));
  const sqlText = await readFile(join(here, '..', '..', 'drizzle', file), 'utf8');
  await getPool().query(sqlText);
}

const FOOD: NormalizedFood = {
  fdcId: '173944',
  description: 'Banana, raw',
  dataType: 'SR Legacy',
  per100g: {
    calories: 89,
    proteinG: 1.1,
    carbsG: 22.8,
    fiberG: 2.6,
    micronutrients: { Potassium: { amount: 358, unit: 'mg' } },
  },
};

describeDb('STEP-45 USDA degradation end-to-end (integration)', () => {
  let app: FastifyInstance;
  // Toggle the upstream: when `down` is true the inner client throws UsdaError,
  // simulating an unreachable USDA (timeout/network/non-2xx) at the boundary.
  let down = false;
  const innerSearch = vi.fn(async (q: string) => {
    if (down) throw new UsdaError('USDA request failed');
    return [FOOD];
  });
  const innerGetFood = vi.fn(async (_id: string) => {
    if (down) throw new UsdaError('USDA request failed');
    return FOOD;
  });

  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');

    const inner = { searchFoods: innerSearch, getFood: innerGetFood } satisfies UsdaClient;
    // Production cache-aside over the togglable inner stub, against the real DB
    // cache. A short TTL is irrelevant here: stale-on-failure ignores TTL (F-9).
    const { getDb } = await import('../db/client.js');
    const cached = createCachedUsdaClient(getDb(), inner);

    const { buildServer } = await import('../server.js');
    app = await buildServer({ databaseUrl: TEST_DATABASE_URL!, usdaClient: cached });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    const { closeDb } = await import('../db/client.js');
    await closeDb();
  });

  beforeEach(async () => {
    down = false;
    innerSearch.mockClear();
    innerGetFood.mockClear();
    const { getDb } = await import('../db/client.js');
    await getDb().execute(sql`DELETE FROM usda_food_cache`);
    // Drop E2E recipes first (cascades to recipe_ingredients) so the custom
    // ingredient cleanup never trips the FK constraint.
    await getDb().execute(sql`DELETE FROM recipes WHERE name LIKE 'E2E %'`);
    await getDb().execute(
      sql`DELETE FROM ingredients i WHERE i.name LIKE 'E2E %'
          AND NOT EXISTS (SELECT 1 FROM recipe_ingredients ri WHERE ri.ingredient_id = i.id)`,
    );
  });

  it('cold cache + USDA down: search returns a clear error envelope (AC-2.3)', async () => {
    down = true; // outage, and the cache is empty (cleared in beforeEach)
    const res = await request(app.server).get('/api/v1/ingredients/search?q=banana');
    expect(res.status).toBe(502);
    expect(res.body?.error?.code).toBe('USDA_UNAVAILABLE');
    expect(typeof res.body?.error?.message).toBe('string');
    // a clear, user-facing message (not a stack)
    expect(res.body.error.message).toMatch(/unavailable/i);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts:/);
  });

  it('during the outage the CUSTOM ingredient path still works (user is never blocked)', async () => {
    down = true;
    const res = await request(app.server)
      .post('/api/v1/ingredients')
      .send({ name: 'E2E Homemade Granola', calories: 450, proteinG: 10, carbsG: 60, fatG: 18 })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(201);
    expect(res.body.source).toBe('custom');
    expect(res.body.nutrition.calories).toBe(450);
    // The outage never touched the custom path (no upstream call needed).
    expect(innerSearch).not.toHaveBeenCalled();
    expect(innerGetFood).not.toHaveBeenCalled();
  });

  it('a previously-cached lookup still resolves during the outage (stale-on-failure, F-9)', async () => {
    // 1. Warm the cache while USDA is healthy.
    down = false;
    const warm = await request(app.server).get('/api/v1/ingredients/search?q=banana');
    expect(warm.status).toBe(200);
    expect(warm.body[0]).toMatchObject({ fdcId: '173944' });
    expect(innerSearch).toHaveBeenCalledTimes(1);

    // 2. USDA goes down. The SAME search must still resolve from the cache.
    down = true;
    const duringOutage = await request(app.server).get(
      '/api/v1/ingredients/search?q=banana',
    );
    expect(duringOutage.status).toBe(200);
    expect(duringOutage.body[0]).toMatchObject({ fdcId: '173944' });
    expect(duringOutage.body[0].per100g.calories).toBe(89);

    // 3. A DIFFERENT, never-cached query still fails clearly during the outage.
    const uncached = await request(app.server).get(
      '/api/v1/ingredients/search?q=neverseen',
    );
    expect(uncached.status).toBe(502);
    expect(uncached.body?.error?.code).toBe('USDA_UNAVAILABLE');
  });
});
