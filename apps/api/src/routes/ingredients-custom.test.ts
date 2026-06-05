import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { UsdaClient } from '../usda/client.js';
import { DEFAULT_WORKSPACE_ID } from '../constants.js';

/**
 * STEP-24 test-first for custom-ingredient create + list (STEP-25).
 *
 * Custom ingredients (FR-3) are the fallback when USDA lacks a food and must
 * persist for reuse (AC-3.3). POST /ingredients creates a workspace-scoped
 * source='custom' row carrying its nutrition on a reference_grams basis; GET
 * /ingredients lists the workspace's saved ingredients (custom + USDA
 * snapshots) so they can be reused. A custom ingredient with no nutrition basis
 * is rejected (Zod, S-3).
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

const STUB_USDA = {
  searchFoods: vi.fn(),
  getFood: vi.fn(),
} satisfies UsdaClient;

describeDb('custom ingredient CRUD (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');
    const { buildServer } = await import('../server.js');
    app = await buildServer({
      databaseUrl: TEST_DATABASE_URL!,
      usdaClient: STUB_USDA,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    const { closeDb } = await import('../db/client.js');
    await closeDb();
  });

  it('POST /ingredients creates a workspace-scoped custom ingredient with nutrition', async () => {
    const res = await request(app.server)
      .post('/api/v1/ingredients')
      .send({
        name: 'Homemade Granola',
        referenceGrams: 100,
        calories: 450,
        proteinG: 10,
        carbsG: 60,
        fatG: 18,
        fiberG: 7,
        micronutrients: { Iron: { amount: 3.2, unit: 'mg' } },
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Homemade Granola',
      source: 'custom',
      fdcId: null,
      referenceGrams: 100,
    });
    expect(res.body.nutrition.calories).toBe(450);
    expect(res.body.nutrition.micronutrients.Iron).toEqual({
      amount: 3.2,
      unit: 'mg',
    });
    expect(typeof res.body.id).toBe('string');

    // Persisted scoped to the seeded workspace.
    const { getDb } = await import('../db/client.js');
    const row = await getDb().execute(
      sql`SELECT workspace_id, source FROM ingredients WHERE id = ${res.body.id}`,
    );
    expect(row.rows[0]).toMatchObject({
      workspace_id: DEFAULT_WORKSPACE_ID,
      source: 'custom',
    });
  });

  it('GET /ingredients lists the created custom ingredient for reuse (AC-3.3)', async () => {
    const created = await request(app.server)
      .post('/api/v1/ingredients')
      .send({ name: 'Reuse Me', calories: 100, proteinG: 5 })
      .set('Content-Type', 'application/json');
    expect(created.status).toBe(201);

    const list = await request(app.server).get('/api/v1/ingredients');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    const found = (list.body as Array<{ id: string; name: string }>).find(
      (i) => i.id === created.body.id,
    );
    expect(found).toBeDefined();
    expect(found!.name).toBe('Reuse Me');
  });

  it('rejects a custom ingredient with no name', async () => {
    const res = await request(app.server)
      .post('/api/v1/ingredients')
      .send({ calories: 100 })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBeDefined();
  });

  it('rejects a custom ingredient with no nutrition basis at all', async () => {
    const res = await request(app.server)
      .post('/api/v1/ingredients')
      .send({ name: 'Empty Calories' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBeDefined();
  });
});
