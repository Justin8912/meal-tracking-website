import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import { createCachedUsdaClient } from './cache.js';
import { UsdaError } from './client.js';
import type { UsdaClient } from './client.js';
import type { NormalizedFood } from './mapper.js';

/**
 * STEP-20 test-first for the Postgres cache-aside + stale-on-outage layer
 * (STEP-21). The cache both respects the USDA rate limit (F-6) and is the
 * degradation store (F-9):
 *   - a MISS calls the underlying client once and persists the normalized result;
 *   - a HIT serves from usda_food_cache WITHOUT calling the client;
 *   - when the client FAILS but a stale entry exists, the stale entry is served;
 *   - when the client FAILS and no entry exists, the typed error propagates.
 *
 * Runs against a disposable Postgres (skips without DATABASE_URL); the USDA
 * client is a stub - the real API is never hit.
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

describeDb('USDA cache-aside (integration)', () => {
  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');
  });

  afterAll(async () => {
    const { closeDb } = await import('../db/client.js');
    await closeDb();
  });

  beforeEach(async () => {
    const { getDb } = await import('../db/client.js');
    await getDb().execute(sql`DELETE FROM usda_food_cache`);
  });

  it('getFood: a miss calls USDA once and persists; a hit serves cache with no call', async () => {
    const { getDb } = await import('../db/client.js');
    const inner = {
      searchFoods: vi.fn(),
      getFood: vi.fn(async () => FOOD),
    } satisfies UsdaClient;
    const cached = createCachedUsdaClient(getDb(), inner);

    const first = await cached.getFood('171705');
    expect(first.per100g.calories).toBe(120);
    expect(inner.getFood).toHaveBeenCalledTimes(1);

    const cacheRows = await getDb().execute(
      sql`SELECT fdc_id FROM usda_food_cache WHERE fdc_id = '171705'`,
    );
    expect(cacheRows.rows).toHaveLength(1);

    const second = await cached.getFood('171705');
    expect(second.per100g.proteinG).toBe(22.5);
    // No second USDA call - served from cache (rate-limit protection, F-6).
    expect(inner.getFood).toHaveBeenCalledTimes(1);
  });

  it('getFood: on USDA failure with a stale entry present, serves the stale entry', async () => {
    const { getDb } = await import('../db/client.js');
    const inner = {
      searchFoods: vi.fn(),
      getFood: vi
        .fn()
        .mockResolvedValueOnce(FOOD)
        .mockRejectedValue(new UsdaError('USDA down')),
    } satisfies UsdaClient;
    const cached = createCachedUsdaClient(getDb(), inner);

    await cached.getFood('171705'); // populates cache
    const stale = await cached.getFood('171705'); // forces the miss path? no - hit
    expect(stale.per100g.calories).toBe(120);

    // Force the stale path: clear nothing, but simulate TTL expiry would still
    // hit cache. Instead, directly drive a fresh client whose only call fails
    // while the cache holds the prior value.
    const failingInner = {
      searchFoods: vi.fn(),
      getFood: vi.fn().mockRejectedValue(new UsdaError('USDA down')),
    } satisfies UsdaClient;
    const cached2 = createCachedUsdaClient(getDb(), failingInner, {
      ttlMs: 0, // every read treats the cache as stale -> tries USDA, then falls back
    });
    const served = await cached2.getFood('171705');
    expect(served.per100g.calories).toBe(120);
    expect(failingInner.getFood).toHaveBeenCalledTimes(1); // it tried, then served stale
  });

  it('getFood: on USDA failure with NO cache entry, the typed error propagates', async () => {
    const { getDb } = await import('../db/client.js');
    const inner = {
      searchFoods: vi.fn(),
      getFood: vi.fn().mockRejectedValue(new UsdaError('USDA down')),
    } satisfies UsdaClient;
    const cached = createCachedUsdaClient(getDb(), inner);

    await expect(cached.getFood('does-not-exist')).rejects.toBeInstanceOf(
      UsdaError,
    );
  });

  it('searchFoods: a miss calls USDA once and persists under a hashed key; a hit serves cache', async () => {
    const { getDb } = await import('../db/client.js');
    const inner = {
      searchFoods: vi.fn(async () => [FOOD]),
      getFood: vi.fn(),
    } satisfies UsdaClient;
    const cached = createCachedUsdaClient(getDb(), inner);

    const first = await cached.searchFoods('chicken breast');
    expect(first).toHaveLength(1);
    expect(inner.searchFoods).toHaveBeenCalledTimes(1);

    const rows = await getDb().execute(
      sql`SELECT fdc_id FROM usda_food_cache WHERE fdc_id LIKE 'search:%'`,
    );
    expect(rows.rows.length).toBeGreaterThanOrEqual(1);

    const second = await cached.searchFoods('chicken breast');
    expect(second).toHaveLength(1);
    expect(inner.searchFoods).toHaveBeenCalledTimes(1); // cache hit, no second call
  });

  it('searchFoods: on USDA failure with a stale cached search, serves the stale results', async () => {
    const { getDb } = await import('../db/client.js');
    const populating = {
      searchFoods: vi.fn(async () => [FOOD]),
      getFood: vi.fn(),
    } satisfies UsdaClient;
    await createCachedUsdaClient(getDb(), populating).searchFoods('oats');

    const failing = {
      searchFoods: vi.fn().mockRejectedValue(new UsdaError('USDA down')),
      getFood: vi.fn(),
    } satisfies UsdaClient;
    const cached = createCachedUsdaClient(getDb(), failing, { ttlMs: 0 });
    const served = await cached.searchFoods('oats');
    expect(served).toHaveLength(1);
    expect(served[0]!.fdcId).toBe('171705');
  });
});
