import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { recipeSchema } from '@meal-tracking/shared';
import { DEFAULT_WORKSPACE_ID } from '../constants.js';

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * STEP-5 test-first for the thin recipe create/list path (STEP-6). It proves
 * the end-to-end persistence round-trip (web->api->postgres): a POSTed recipe
 * is created (201, persisted row with a server-generated id), then reappears in
 * GET /recipes read FROM THE DB and scoped to the seeded workspace (platform
 * AD-4). A hardcoded list response could not satisfy the round-trip assertion.
 * Fails before STEP-6 (routes not registered).
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

describeDb('recipes routes (integration)', () => {
  let app: FastifyInstance | undefined;
  let ingredientId: string;

  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');

    const { getDb } = await import('../db/client.js');
    const ing = await getDb().execute(
      sql`INSERT INTO ingredients (workspace_id, name, source)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'Rolled Oats', 'custom')
          RETURNING id`,
    );
    ingredientId = ing.rows[0]?.id as string;

    const { buildServer } = await import('../server.js');
    app = await buildServer({ databaseUrl: TEST_DATABASE_URL! });
    await app.ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    const { closeDb } = await import('../db/client.js');
    await closeDb();
  });

  it('POST /recipes creates a recipe (201) and GET /recipes includes it from the DB', async () => {
    const body = {
      name: 'Round-Trip Oatmeal',
      mealType: 'breakfast',
      servings: 2,
      ingredients: [{ ingredientId, quantity: 1, unitCode: 'cup' }],
    };

    const created = await request(app!.server)
      .post('/api/v1/recipes')
      .send(body)
      .set('Content-Type', 'application/json');

    expect(created.status).toBe(201);
    const parsedCreated = recipeSchema.safeParse(created.body);
    expect(parsedCreated.success).toBe(true);
    expect(created.body.name).toBe('Round-Trip Oatmeal');
    expect(created.body.servings).toBe(2);
    expect(typeof created.body.id).toBe('string');
    const createdId = created.body.id as string;

    const list = await request(app!.server).get('/api/v1/recipes');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    const found = (list.body as Array<{ id: string }>).find(
      (r) => r.id === createdId,
    );
    expect(found).toBeDefined();
    expect(recipeSchema.safeParse(found).success).toBe(true);

    // Confirm it was persisted scoped to the seeded workspace.
    const { getDb } = await import('../db/client.js');
    const row = await getDb().execute(
      sql`SELECT workspace_id FROM recipes WHERE id = ${createdId}`,
    );
    expect(row.rows[0]).toMatchObject({ workspace_id: DEFAULT_WORKSPACE_ID });
  });

  it('POST /recipes returns a 400 error envelope on validation failure', async () => {
    const res = await request(app!.server)
      .post('/api/v1/recipes')
      .send({ name: 'No servings', mealType: 'breakfast', servings: 0, ingredients: [] })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBeDefined();
    expect(typeof res.body?.error?.message).toBe('string');
  });
});
