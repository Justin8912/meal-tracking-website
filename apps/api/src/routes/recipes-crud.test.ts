import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { recipeDetailSchema, errorEnvelopeSchema } from '@meal-tracking/shared';
import { DEFAULT_WORKSPACE_ID } from '../constants.js';

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * STEP-28 test-first for full recipe CRUD (STEP-29). These exercise the failure
 * contracts AC-1.5/1.6 (no-name/no-ingredients -> 400 without persisting; a DB
 * write failure -> 5xx envelope, never a false success) alongside the happy
 * paths: PUT persists and is reflected by GET/:id, DELETE removes the recipe
 * from GET and search, and empty notes/link still saves. Fails before STEP-29
 * (GET/:id, PUT, DELETE not implemented).
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

describeDb('recipes CRUD routes (integration)', () => {
  let app: FastifyInstance | undefined;
  let ingredientId: string;

  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');

    const { getDb } = await import('../db/client.js');
    const ing = await getDb().execute(
      sql`INSERT INTO ingredients (workspace_id, name, source)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'CRUD Oats', 'custom')
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

  async function createRecipe(overrides: Record<string, unknown> = {}) {
    const body = {
      name: 'CRUD Base',
      mealType: 'dinner',
      servings: 2,
      ingredients: [{ ingredientId, quantity: 1, unitCode: 'cup' }],
      ...overrides,
    };
    const res = await request(app!.server)
      .post('/api/v1/recipes')
      .send(body)
      .set('Content-Type', 'application/json');
    return res;
  }

  it('GET /recipes/:id returns the recipe with ingredients and tags', async () => {
    const created = await createRecipe({ name: 'Detailable' });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const res = await request(app!.server).get(`/api/v1/recipes/${id}`);
    expect(res.status).toBe(200);
    const parsed = recipeDetailSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    expect(res.body.name).toBe('Detailable');
    expect(Array.isArray(res.body.ingredients)).toBe(true);
    expect(res.body.ingredients.length).toBe(1);
    expect(res.body.ingredients[0].ingredientId).toBe(ingredientId);
    expect(res.body.ingredients[0].name).toBe('CRUD Oats');
    expect(Array.isArray(res.body.tags)).toBe(true);
  });

  it('GET /recipes/:id for an unknown id returns a 404 envelope', async () => {
    const res = await request(app!.server).get(
      '/api/v1/recipes/00000000-0000-0000-0000-0000000000ff',
    );
    expect(res.status).toBe(404);
    expect(errorEnvelopeSchema.safeParse(res.body).success).toBe(true);
  });

  it('PUT /recipes/:id updates fields and persists (AC-1.2)', async () => {
    const created = await createRecipe({ name: 'Before', servings: 2 });
    const id = created.body.id as string;

    const updated = await request(app!.server)
      .put(`/api/v1/recipes/${id}`)
      .send({
        name: 'After',
        mealType: 'lunch',
        servings: 4,
        notes: 'changed',
        ingredients: [{ ingredientId, quantity: 3, unitCode: 'cup' }],
      })
      .set('Content-Type', 'application/json');

    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('After');
    expect(updated.body.mealType).toBe('lunch');
    expect(updated.body.servings).toBe(4);

    const fetched = await request(app!.server).get(`/api/v1/recipes/${id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.name).toBe('After');
    expect(fetched.body.notes).toBe('changed');
    expect(fetched.body.ingredients[0].quantity).toBe(3);
  });

  it('DELETE /recipes/:id removes it from GET and search (AC-1.3)', async () => {
    const created = await createRecipe({ name: 'DeleteMeUnique' });
    const id = created.body.id as string;

    const del = await request(app!.server).delete(`/api/v1/recipes/${id}`);
    expect(del.status).toBe(204);

    const fetched = await request(app!.server).get(`/api/v1/recipes/${id}`);
    expect(fetched.status).toBe(404);

    const search = await request(app!.server).get(
      '/api/v1/recipes?q=DeleteMeUnique',
    );
    expect(search.status).toBe(200);
    expect(
      (search.body as Array<{ id: string }>).find((r) => r.id === id),
    ).toBeUndefined();
  });

  it('POST /recipes with empty notes/link still saves (AC-1.4)', async () => {
    const res = await createRecipe({
      name: 'NoOptional',
      notes: null,
      sourceLink: null,
    });
    expect(res.status).toBe(201);
    expect(res.body.notes).toBeNull();
    expect(res.body.sourceLink).toBeNull();
  });

  it('POST /recipes with no name returns 400 and persists nothing (AC-1.5)', async () => {
    const { getDb } = await import('../db/client.js');
    const before = await getDb().execute(
      sql`SELECT count(*)::int AS c FROM recipes`,
    );
    const beforeCount = before.rows[0]?.c as number;

    const res = await request(app!.server)
      .post('/api/v1/recipes')
      .send({
        name: '',
        mealType: 'dinner',
        servings: 2,
        ingredients: [{ ingredientId, quantity: 1, unitCode: 'cup' }],
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(errorEnvelopeSchema.safeParse(res.body).success).toBe(true);

    const after = await getDb().execute(
      sql`SELECT count(*)::int AS c FROM recipes`,
    );
    expect(after.rows[0]?.c).toBe(beforeCount);
  });

  it('POST /recipes with no ingredients returns 400 (AC-1.5)', async () => {
    const res = await request(app!.server)
      .post('/api/v1/recipes')
      .send({
        name: 'NoIngredients',
        mealType: 'dinner',
        servings: 2,
        ingredients: [],
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(errorEnvelopeSchema.safeParse(res.body).success).toBe(true);
  });

  it('a forced DB failure on write surfaces a 5xx envelope, never a false success (AC-1.6)', async () => {
    const { buildServer } = await import('../server.js');
    // A server pointed at an unreachable DB: a valid POST must fail closed with
    // a 5xx envelope rather than report a false success.
    const broken = await buildServer({
      databaseUrl: 'postgres://postgres:postgres@127.0.0.1:1/nope',
    });
    await broken.ready();
    try {
      const res = await request(broken.server)
        .post('/api/v1/recipes')
        .send({
          name: 'WillFail',
          mealType: 'dinner',
          servings: 2,
          ingredients: [{ ingredientId, quantity: 1, unitCode: 'cup' }],
        })
        .set('Content-Type', 'application/json');

      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(res.body.id).toBeUndefined();
      expect(errorEnvelopeSchema.safeParse(res.body).success).toBe(true);
    } finally {
      await broken.close();
    }
  });
});
