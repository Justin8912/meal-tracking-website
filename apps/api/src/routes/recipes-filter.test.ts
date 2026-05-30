import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_WORKSPACE_ID } from '../constants.js';

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * STEP-32 test-first for tag/meal-type filtering (STEP-33, AD-6). Seeds recipes
 * across meal types and tags and asserts: ?tag= narrows to recipes with that
 * tag (AC-5.2), ?mealType= narrows to that meal type (AC-5.3), the two combine
 * with AND, empty params are ignored, and a tag value with SQL metacharacters
 * is treated as a literal (parameterized, S-4). Fails before STEP-33.
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

describeDb('recipes filtering (integration)', () => {
  let app: FastifyInstance | undefined;
  let ingredientId: string;
  const ids: Record<string, string> = {};

  async function create(
    name: string,
    mealType: string,
    tags: string[],
  ): Promise<string> {
    const res = await request(app!.server)
      .post('/api/v1/recipes')
      .send({
        name,
        mealType,
        servings: 2,
        ingredients: [{ ingredientId, quantity: 1, unitCode: 'cup' }],
        tags,
      })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');

    const { getDb } = await import('../db/client.js');
    const ing = await getDb().execute(
      sql`INSERT INTO ingredients (workspace_id, name, source)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'Filter Oats', 'custom')
          RETURNING id`,
    );
    ingredientId = ing.rows[0]?.id as string;

    const { buildServer } = await import('../server.js');
    app = await buildServer({ databaseUrl: TEST_DATABASE_URL! });
    await app.ready();

    ids.quickDinner = await create('Quick Dinner', 'dinner', ['flt-quick']);
    ids.slowDinner = await create('Slow Dinner', 'dinner', ['flt-slow']);
    ids.quickLunch = await create('Quick Lunch', 'lunch', ['flt-quick']);
    // A recipe whose tag contains SQL/LIKE metacharacters; must be literal.
    ids.evil = await create('Evil Recipe', 'snack', ["100%' OR '1'='1"]);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    const { closeDb } = await import('../db/client.js');
    await closeDb();
  });

  function idsOf(body: unknown): string[] {
    return (body as Array<{ id: string }>).map((r) => r.id);
  }

  it('?tag= returns only recipes with that tag (AC-5.2)', async () => {
    const res = await request(app!.server).get('/api/v1/recipes?tag=flt-quick');
    expect(res.status).toBe(200);
    const got = idsOf(res.body);
    expect(got).toContain(ids.quickDinner);
    expect(got).toContain(ids.quickLunch);
    expect(got).not.toContain(ids.slowDinner);
  });

  it('?mealType= returns only that meal type (AC-5.3)', async () => {
    const res = await request(app!.server).get(
      '/api/v1/recipes?mealType=dinner',
    );
    expect(res.status).toBe(200);
    const got = idsOf(res.body);
    expect(got).toContain(ids.quickDinner);
    expect(got).toContain(ids.slowDinner);
    expect(got).not.toContain(ids.quickLunch);
  });

  it('?tag=&mealType= combine with AND', async () => {
    const res = await request(app!.server).get(
      '/api/v1/recipes?tag=flt-quick&mealType=dinner',
    );
    expect(res.status).toBe(200);
    const got = idsOf(res.body);
    // The quick dinner is present; the quick lunch (wrong meal type) and the
    // slow dinner (wrong tag) are both excluded - proving AND, not OR.
    expect(got).toContain(ids.quickDinner);
    expect(got).not.toContain(ids.quickLunch);
    expect(got).not.toContain(ids.slowDinner);
    // Every returned row is a dinner (meal-type filter held).
    for (const r of res.body as Array<{ mealType: string }>) {
      expect(r.mealType).toBe('dinner');
    }
  });

  it('empty filter params are ignored (returns all)', async () => {
    const res = await request(app!.server).get(
      '/api/v1/recipes?tag=&mealType=',
    );
    expect(res.status).toBe(200);
    const got = idsOf(res.body);
    expect(got).toContain(ids.quickDinner);
    expect(got).toContain(ids.slowDinner);
    expect(got).toContain(ids.quickLunch);
  });

  it('a tag with SQL metacharacters is treated as a literal (parameterized, S-4)', async () => {
    // Matches only the recipe literally tagged with the metacharacter string;
    // it must NOT short-circuit to "match everything" via injection.
    const literal = await request(app!.server)
      .get('/api/v1/recipes')
      .query({ tag: "100%' OR '1'='1" });
    expect(literal.status).toBe(200);
    expect(idsOf(literal.body)).toContain(ids.evil);
    // It matched ONLY recipes literally tagged with that string, never all
    // recipes via injection: the quick/slow dinners are excluded and every
    // returned row is the evil recipe by name.
    expect(idsOf(literal.body)).not.toContain(ids.quickDinner);
    expect(idsOf(literal.body)).not.toContain(ids.slowDinner);
    for (const r of literal.body as Array<{ name: string }>) {
      expect(r.name).toBe('Evil Recipe');
    }

    // A different injection-looking tag that no recipe has -> empty, not all.
    const none = await request(app!.server)
      .get('/api/v1/recipes')
      .query({ tag: "' OR 1=1 --" });
    expect(none.status).toBe(200);
    expect(idsOf(none.body)).toEqual([]);
  });
});
