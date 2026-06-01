import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { errorEnvelopeSchema } from '@meal-tracking/shared';
import { DEFAULT_WORKSPACE_ID } from '../constants.js';

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * STEP-7 test-first for full plan-entry CRUD (STEP-8). Bundle 1 shipped the thin
 * add/list path; this exercises the write surface that completes it:
 *   * PUT /plans/:id edits a freeform meal and the change persists for the right
 *     day/slot (AC-1.4) - proven by reading it back from GET /plans.
 *   * DELETE /plans/:id removes the entry (AC-1.4) - it no longer appears in the
 *     week list.
 *   * A both-recipe-and-freeform PUT body is rejected with a 400 envelope (the
 *     XOR on edit, S-1) and nothing is mutated.
 *   * A forced DB write failure on PUT surfaces a 5xx envelope, never a false
 *     success (AC-1.6) - the plan is not silently lost.
 *   * PUT/DELETE for an unknown id returns a 404 envelope (workspace-scoped).
 * Fails before STEP-8 (PUT/DELETE not implemented -> 404 from the not-found
 * handler for the happy-path edits/deletes).
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

describeDb('plans CRUD routes (integration)', () => {
  let app: FastifyInstance | undefined;
  let recipeId: string;

  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');
    await applyMigration('0003_weekly_planner.sql');

    const { getDb } = await import('../db/client.js');
    const recipe = await getDb().execute(
      sql`INSERT INTO recipes (workspace_id, name, meal_type, servings)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'CRUD Planner Recipe', 'dinner', 2)
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

  /** Create a freeform entry for the Monday 2026-06-08 week and return its id. */
  async function createFreeform(
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await request(app!.server)
      .post('/api/v1/plans')
      .send({
        weekStart: '2026-06-08',
        dayOfWeek: 1,
        mealSlot: 'lunch',
        freeformTitle: 'Original Title',
        ...overrides,
      })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it('PUT /plans/:id edits a freeform meal and the change persists for that day/slot (AC-1.4)', async () => {
    const id = await createFreeform({
      freeformTitle: 'Before Edit',
      freeformDescription: 'old desc',
    });

    const updated = await request(app!.server)
      .put(`/api/v1/plans/${id}`)
      .send({
        weekStart: '2026-06-08',
        dayOfWeek: 3,
        mealSlot: 'dinner',
        freeformTitle: 'After Edit',
        freeformDescription: 'new desc',
        freeformLink: 'https://example.com/recipe',
      })
      .set('Content-Type', 'application/json');

    expect(updated.status).toBe(200);
    expect(updated.body.id).toBe(id);
    expect(updated.body.freeformTitle).toBe('After Edit');
    expect(updated.body.freeformDescription).toBe('new desc');
    expect(updated.body.freeformLink).toBe('https://example.com/recipe');
    expect(updated.body.dayOfWeek).toBe(3);
    expect(updated.body.mealSlot).toBe('dinner');
    expect(updated.body.recipeId).toBeNull();

    // The edit is reflected when the week is read back from the DB.
    const list = await request(app!.server).get(
      '/api/v1/plans?weekStart=2026-06-08',
    );
    expect(list.status).toBe(200);
    const found = (
      list.body as Array<{ id: string; freeformTitle: string; dayOfWeek: number }>
    ).find((e) => e.id === id);
    expect(found).toBeDefined();
    expect(found?.freeformTitle).toBe('After Edit');
    expect(found?.dayOfWeek).toBe(3);
  });

  it('DELETE /plans/:id removes the entry from the week (AC-1.4)', async () => {
    const id = await createFreeform({ freeformTitle: 'DeleteMe' });

    const del = await request(app!.server).delete(`/api/v1/plans/${id}`);
    expect(del.status).toBe(204);

    const list = await request(app!.server).get(
      '/api/v1/plans?weekStart=2026-06-08',
    );
    expect(list.status).toBe(200);
    expect(
      (list.body as Array<{ id: string }>).find((e) => e.id === id),
    ).toBeUndefined();
  });

  it('PUT /plans/:id rejects a both-recipe-and-freeform body with a 400 envelope (XOR, S-1)', async () => {
    const id = await createFreeform({ freeformTitle: 'StaysSame' });

    const res = await request(app!.server)
      .put(`/api/v1/plans/${id}`)
      .send({
        weekStart: '2026-06-08',
        dayOfWeek: 1,
        mealSlot: 'lunch',
        recipeId,
        freeformTitle: 'Both Set',
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(errorEnvelopeSchema.safeParse(res.body).success).toBe(true);

    // The rejected edit mutated nothing: the original entry is unchanged.
    const list = await request(app!.server).get(
      '/api/v1/plans?weekStart=2026-06-08',
    );
    const found = (
      list.body as Array<{ id: string; freeformTitle: string }>
    ).find((e) => e.id === id);
    expect(found?.freeformTitle).toBe('StaysSame');
  });

  it('PUT /plans/:id can switch a freeform meal to a recipe meal (AC-1.4)', async () => {
    const id = await createFreeform({ freeformTitle: 'Will become a recipe' });

    const updated = await request(app!.server)
      .put(`/api/v1/plans/${id}`)
      .send({
        weekStart: '2026-06-08',
        dayOfWeek: 1,
        mealSlot: 'lunch',
        recipeId,
      })
      .set('Content-Type', 'application/json');

    expect(updated.status).toBe(200);
    expect(updated.body.recipeId).toBe(recipeId);
    expect(updated.body.freeformTitle).toBeNull();
  });

  it('PUT /plans/:id for an unknown id returns a 404 envelope', async () => {
    const res = await request(app!.server)
      .put('/api/v1/plans/00000000-0000-0000-0000-0000000000ff')
      .send({
        weekStart: '2026-06-08',
        dayOfWeek: 1,
        mealSlot: 'lunch',
        freeformTitle: 'Nope',
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(404);
    expect(errorEnvelopeSchema.safeParse(res.body).success).toBe(true);
  });

  it('DELETE /plans/:id for an unknown id returns a 404 envelope', async () => {
    const res = await request(app!.server).delete(
      '/api/v1/plans/00000000-0000-0000-0000-0000000000ff',
    );
    expect(res.status).toBe(404);
    expect(errorEnvelopeSchema.safeParse(res.body).success).toBe(true);
  });

  it('a forced DB failure on PUT surfaces a 5xx envelope, never a false success (AC-1.6)', async () => {
    const id = await createFreeform({ freeformTitle: 'Persisted' });

    const { buildServer } = await import('../server.js');
    // A server pointed at an unreachable DB: a valid PUT must fail closed with a
    // 5xx envelope rather than report a false success (the plan is not lost).
    const broken = await buildServer({
      databaseUrl: 'postgres://postgres:postgres@127.0.0.1:1/nope',
    });
    await broken.ready();
    try {
      const res = await request(broken.server)
        .put(`/api/v1/plans/${id}`)
        .send({
          weekStart: '2026-06-08',
          dayOfWeek: 1,
          mealSlot: 'lunch',
          freeformTitle: 'WillFail',
        })
        .set('Content-Type', 'application/json');

      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(res.body.id).toBeUndefined();
      expect(errorEnvelopeSchema.safeParse(res.body).success).toBe(true);
    } finally {
      await broken.close();
    }

    // The original entry on the real DB is untouched by the failed write.
    const list = await request(app!.server).get(
      '/api/v1/plans?weekStart=2026-06-08',
    );
    const found = (
      list.body as Array<{ id: string; freeformTitle: string }>
    ).find((e) => e.id === id);
    expect(found?.freeformTitle).toBe('Persisted');
  });
});
