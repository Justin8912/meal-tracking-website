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
 * STEP-4 test-first for the thin plan add/list path (STEP-5). It proves the
 * end-to-end persistence round-trip (web->api->postgres): a POSTed plan entry
 * is created (201, persisted row with a server-generated id, scoped to the
 * seeded workspace - platform AD-4), then reappears in GET /plans?weekStart=
 * read FROM THE DB. It also pins the Monday normalization (AD-2, S-4): the
 * server derives week_start_date as the Monday, and a mid-week weekStart on the
 * GET maps to the same Monday and still returns the entry. A hardcoded response
 * could not satisfy the round-trip assertion. Fails before STEP-5 (routes not
 * registered).
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

describeDb('plans routes (integration)', () => {
  let app: FastifyInstance | undefined;
  let recipeId: string;

  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');
    await applyMigration('0003_weekly_planner.sql');

    const { getDb } = await import('../db/client.js');
    const recipe = await getDb().execute(
      sql`INSERT INTO recipes (workspace_id, name, meal_type, servings)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'Planner Oatmeal', 'breakfast', 2)
          RETURNING id`,
    );
    recipeId = recipe.rows[0]?.id as string;

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

  it('POST /plans creates a recipe-only entry (201) and GET /plans?weekStart= includes it from the DB', async () => {
    // Monday 2026-06-01; day_of_week 2 (Wednesday), lunch.
    const created = await request(app!.server)
      .post('/api/v1/plans')
      .send({
        weekStart: '2026-06-01',
        dayOfWeek: 2,
        mealSlot: 'lunch',
        recipeId,
      })
      .set('Content-Type', 'application/json');

    expect(created.status).toBe(201);
    expect(typeof created.body.id).toBe('string');
    expect(created.body.weekStartDate).toBe('2026-06-01');
    expect(created.body.dayOfWeek).toBe(2);
    expect(created.body.mealSlot).toBe('lunch');
    expect(created.body.recipeId).toBe(recipeId);
    expect(created.body.freeformTitle).toBeNull();
    const createdId = created.body.id as string;

    const list = await request(app!.server).get(
      '/api/v1/plans?weekStart=2026-06-01',
    );
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    const found = (list.body as Array<{ id: string }>).find(
      (e) => e.id === createdId,
    );
    expect(found).toBeDefined();

    // Persisted scoped to the seeded workspace, keyed by the Monday DATE.
    const { getDb } = await import('../db/client.js');
    const row = await getDb().execute(
      sql`SELECT workspace_id, week_start_date FROM plan_entries WHERE id = ${createdId}`,
    );
    expect(row.rows[0]).toMatchObject({ workspace_id: DEFAULT_WORKSPACE_ID });
  });

  it('normalizes a mid-week weekStart to the same Monday (AD-2)', async () => {
    // POST a freeform entry for the Monday week of 2026-06-01.
    const created = await request(app!.server)
      .post('/api/v1/plans')
      .send({
        weekStart: '2026-06-01',
        dayOfWeek: 4,
        mealSlot: 'dinner',
        freeformTitle: 'Mid-week marker',
      })
      .set('Content-Type', 'application/json');
    expect(created.status).toBe(201);
    const createdId = created.body.id as string;

    // GET with a mid-week date (Thursday 2026-06-04) must normalize to Monday
    // 2026-06-01 and still return the entry.
    const list = await request(app!.server).get(
      '/api/v1/plans?weekStart=2026-06-04',
    );
    expect(list.status).toBe(200);
    const found = (list.body as Array<{ id: string; weekStartDate: string }>).find(
      (e) => e.id === createdId,
    );
    expect(found).toBeDefined();
    expect(found?.weekStartDate).toBe('2026-06-01');
  });

  it('also accepts a mid-week weekStart on POST and stores the Monday', async () => {
    // Friday 2026-06-05 -> Monday 2026-06-01.
    const created = await request(app!.server)
      .post('/api/v1/plans')
      .send({
        weekStart: '2026-06-05',
        dayOfWeek: 0,
        mealSlot: 'breakfast',
        freeformTitle: 'Posted mid-week',
      })
      .set('Content-Type', 'application/json');
    expect(created.status).toBe(201);
    expect(created.body.weekStartDate).toBe('2026-06-01');
  });

  it('returns a 400 error envelope when a body sets both a recipeId and a freeformTitle (XOR)', async () => {
    const res = await request(app!.server)
      .post('/api/v1/plans')
      .send({
        weekStart: '2026-06-01',
        dayOfWeek: 0,
        mealSlot: 'breakfast',
        recipeId,
        freeformTitle: 'Both',
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBeDefined();
    expect(typeof res.body?.error?.message).toBe('string');
  });

  it('returns a 400 error envelope when weekStart is missing on GET', async () => {
    const res = await request(app!.server).get('/api/v1/plans');
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBeDefined();
  });
});
