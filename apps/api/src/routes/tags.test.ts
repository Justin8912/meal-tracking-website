import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { tagSchema } from '@meal-tracking/shared';
import { DEFAULT_WORKSPACE_ID } from '../constants.js';

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * STEP-30 test-first for tags + recipe_tags (STEP-31). Tags are workspace-scoped
 * and unique by label (AD-2): POST /tags creates a tag, a duplicate label does
 * not create a second row (idempotent upsert), and applying tags via the recipe
 * payload writes recipe_tags so the tag is queryable for filtering (AC-5.1 ->
 * AC-5.2). Fails before STEP-31 (tags route not registered).
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

describeDb('tags routes (integration)', () => {
  let app: FastifyInstance | undefined;
  let ingredientId: string;

  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');

    const { getDb } = await import('../db/client.js');
    const ing = await getDb().execute(
      sql`INSERT INTO ingredients (workspace_id, name, source)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'Tag Oats', 'custom')
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

  it('POST /tags creates a tag (AC-5.1)', async () => {
    const res = await request(app!.server)
      .post('/api/v1/tags')
      .send({ label: 'weeknight' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    const parsed = tagSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    expect(res.body.label).toBe('weeknight');

    const list = await request(app!.server).get('/api/v1/tags');
    expect(list.status).toBe(200);
    expect(
      (list.body as Array<{ label: string }>).filter(
        (t) => t.label === 'weeknight',
      ).length,
    ).toBe(1);
  });

  it('POST /tags with a duplicate label does not create a second row (idempotent)', async () => {
    await request(app!.server)
      .post('/api/v1/tags')
      .send({ label: 'dupe-label' })
      .set('Content-Type', 'application/json');
    const second = await request(app!.server)
      .post('/api/v1/tags')
      .send({ label: 'dupe-label' })
      .set('Content-Type', 'application/json');
    expect(second.status).toBe(201);

    const { getDb } = await import('../db/client.js');
    const rows = await getDb().execute(
      sql`SELECT count(*)::int AS c FROM tags WHERE label = 'dupe-label'`,
    );
    expect(rows.rows[0]?.c).toBe(1);
  });

  it('POST /tags with an empty label returns 400', async () => {
    const res = await request(app!.server)
      .post('/api/v1/tags')
      .send({ label: '   ' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBeDefined();
  });

  it('applying tags via the recipe payload writes recipe_tags and lists the tag once (AC-5.1)', async () => {
    const created = await request(app!.server)
      .post('/api/v1/recipes')
      .send({
        name: 'Tagged Recipe',
        mealType: 'dinner',
        servings: 2,
        ingredients: [{ ingredientId, quantity: 1, unitCode: 'cup' }],
        tags: ['quick', 'quick', 'spicy'],
      })
      .set('Content-Type', 'application/json');

    expect(created.status).toBe(201);
    expect(created.body.tags.sort()).toEqual(['quick', 'spicy']);

    const list = await request(app!.server).get('/api/v1/tags');
    expect(
      (list.body as Array<{ label: string }>).filter((t) => t.label === 'quick')
        .length,
    ).toBe(1);

    // The recipe is queryable under the applied tag filter (feeds AC-5.2).
    const filtered = await request(app!.server).get(
      '/api/v1/recipes?tag=quick',
    );
    expect(filtered.status).toBe(200);
    expect(
      (filtered.body as Array<{ id: string }>).some(
        (r) => r.id === created.body.id,
      ),
    ).toBe(true);
  });
});
