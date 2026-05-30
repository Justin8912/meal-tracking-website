import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { UsdaError } from '../usda/client.js';
import type { UsdaClient } from '../usda/client.js';
import type { NormalizedFood } from '../usda/mapper.js';

/**
 * STEP-22 test-first for the ingredient proxy routes (STEP-23).
 *
 * The proxy is the ONLY thing the browser talks to: the api_key must never
 * appear in any response body or header (AC-2.4). A search must return
 * normalized per-100g results; an upstream outage with no cache must yield a
 * clear error envelope (AC-2.3), not a raw 500/stack.
 *
 * The USDA client is stubbed (no real API, no DB needed for the proxy paths);
 * runs against a disposable Postgres for the server's pool but the stub short-
 * circuits caching. Skips without DATABASE_URL.
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
    micronutrients: { Calcium: { amount: 5, unit: 'mg' } },
  },
};

const SECRET = 'TOP_SECRET_USDA_KEY';

async function buildWithUsda(client: UsdaClient): Promise<FastifyInstance> {
  const { buildServer } = await import('../server.js');
  return buildServer({
    databaseUrl: TEST_DATABASE_URL!,
    usdaClient: client,
    // a key is present in config so we can assert it is NEVER echoed
    usdaApiKey: SECRET,
  });
}

describeDb('ingredient proxy routes (integration)', () => {
  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');
  });

  afterAll(async () => {
    const { closeDb } = await import('../db/client.js');
    await closeDb();
  });

  it('GET /ingredients/search?q= returns normalized results; the key is absent', async () => {
    const client = {
      searchFoods: vi.fn(async () => [FOOD]),
      getFood: vi.fn(),
    } satisfies UsdaClient;
    const app = await buildWithUsda(client);
    await app.ready();

    try {
      const res = await request(app.server).get(
        '/api/v1/ingredients/search?q=chicken',
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toMatchObject({
        fdcId: '171705',
        description: 'Chicken breast, raw',
        per100g: { calories: 120, proteinG: 22.5 },
      });
      expect(client.searchFoods).toHaveBeenCalledWith('chicken');

      // AC-2.4: the key must not leak via body OR headers.
      expect(JSON.stringify(res.body)).not.toContain(SECRET);
      expect(JSON.stringify(res.headers)).not.toContain(SECRET);
    } finally {
      await app.close();
    }
  });

  it('GET /ingredients/usda/:fdcId returns the normalized detail', async () => {
    const client = {
      searchFoods: vi.fn(),
      getFood: vi.fn(async () => FOOD),
    } satisfies UsdaClient;
    const app = await buildWithUsda(client);
    await app.ready();

    try {
      const res = await request(app.server).get(
        '/api/v1/ingredients/usda/171705',
      );
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ fdcId: '171705' });
      expect(client.getFood).toHaveBeenCalledWith('171705');
      expect(JSON.stringify(res.body)).not.toContain(SECRET);
    } finally {
      await app.close();
    }
  });

  it('GET /ingredients/search requires q', async () => {
    const client = {
      searchFoods: vi.fn(async () => [FOOD]),
      getFood: vi.fn(),
    } satisfies UsdaClient;
    const app = await buildWithUsda(client);
    await app.ready();

    try {
      const res = await request(app.server).get('/api/v1/ingredients/search');
      expect(res.status).toBe(400);
      expect(res.body?.error?.code).toBeDefined();
      expect(client.searchFoods).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('on USDA failure with no cache, returns the error envelope with a clear code (AC-2.3)', async () => {
    const client = {
      searchFoods: vi.fn(async () => {
        throw new UsdaError('USDA down');
      }),
      getFood: vi.fn(),
    } satisfies UsdaClient;
    const app = await buildWithUsda(client);
    await app.ready();

    try {
      const res = await request(app.server).get(
        '/api/v1/ingredients/search?q=anything',
      );
      expect(res.status).toBe(502);
      expect(res.body?.error?.code).toBe('USDA_UNAVAILABLE');
      expect(typeof res.body?.error?.message).toBe('string');
      // never a stack, never the key
      expect(JSON.stringify(res.body)).not.toContain(SECRET);
      expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts:/);
    } finally {
      await app.close();
    }
  });
});
