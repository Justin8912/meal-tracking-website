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
 * STEP-34 test-first for name search (STEP-35, AD-6). ?q= is a parameterized
 * case-insensitive partial name match (ILIKE); it composes with the filters,
 * ignores empty/whitespace q, and returns an empty array (200, not 500) for no
 * matches so the UI can render its empty state (AC-6.1 feeds AC-6.2). Fails
 * before STEP-35.
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

describeDb('recipes name search (integration)', () => {
  let app: FastifyInstance | undefined;
  let ingredientId: string;
  const ids: Record<string, string> = {};

  async function create(
    name: string,
    tags: string[] = [],
  ): Promise<string> {
    const res = await request(app!.server)
      .post('/api/v1/recipes')
      .send({
        name,
        mealType: 'dinner',
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
          VALUES (${DEFAULT_WORKSPACE_ID}, 'Search Oats', 'custom')
          RETURNING id`,
    );
    ingredientId = ing.rows[0]?.id as string;

    const { buildServer } = await import('../server.js');
    app = await buildServer({ databaseUrl: TEST_DATABASE_URL! });
    await app.ready();

    ids.chicken = await create('Srch Chicken Bowl', ['srch-quick']);
    ids.beef = await create('Srch Beef Tacos');
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

  it('?q= matches recipe names case-insensitively and partially (AC-6.1)', async () => {
    const res = await request(app!.server).get('/api/v1/recipes?q=srch%20chick');
    expect(res.status).toBe(200);
    const got = idsOf(res.body);
    expect(got).toContain(ids.chicken);
    expect(got).not.toContain(ids.beef);
  });

  it('?q= is case-insensitive (ILIKE)', async () => {
    const res = await request(app!.server).get('/api/v1/recipes?q=SRCH%20BEEF');
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toContain(ids.beef);
  });

  it('a non-matching ?q= returns an empty array (200, not 500) (AC-6.2)', async () => {
    const res = await request(app!.server).get('/api/v1/recipes?q=zzznotarecipe');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([]);
  });

  it('whitespace-only ?q= is ignored (returns the full set)', async () => {
    const res = await request(app!.server).get('/api/v1/recipes?q=%20%20');
    expect(res.status).toBe(200);
    const got = idsOf(res.body);
    expect(got).toContain(ids.chicken);
    expect(got).toContain(ids.beef);
  });

  it('?q= composes with the tag filter (AND)', async () => {
    const res = await request(app!.server).get(
      '/api/v1/recipes?q=srch&tag=srch-quick',
    );
    expect(res.status).toBe(200);
    const got = idsOf(res.body);
    expect(got).toContain(ids.chicken);
    expect(got).not.toContain(ids.beef);
  });
});
