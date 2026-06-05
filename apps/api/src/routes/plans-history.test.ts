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
 * STEP-13 (test-first for STEP-14): the history guarantee, AC-3.3. A past week
 * that had meals planned must still show them when revisited later, with no
 * reliance on client state — the meals are ordinary plan_entries rows (AD-1)
 * read back FROM THE DB by Monday DATE (AD-2).
 *
 * This mirrors the UI flow "plan a past week -> navigate away -> navigate back
 * (cold cache)" at the API level: GET the planned past week (it has the meals),
 * GET a DIFFERENT week (it does not — proving no leakage / no stale data), then
 * GET the past week AGAIN and assert its meals are intact and identical. It also
 * exercises a year-boundary past week (Monday 2025-12-29 -> next 2026-01-05) so
 * the F-11 bug cannot recur. A new test file shares the same process-wide pool;
 * fails meaningfully before STEP-14's guarantee is in place end-to-end.
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

describeDb('plans history retained across navigation (AC-3.3, integration)', () => {
  let app: FastifyInstance | undefined;

  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');
    await applyMigration('0003_weekly_planner.sql');

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

  it('a past week keeps its planned meals after navigating away and back', async () => {
    // A past week: Monday 2024-03-04.
    const pastWeek = '2024-03-04';
    const otherWeek = '2024-03-11';

    const created = await request(app!.server)
      .post('/api/v1/plans')
      .send({
        weekStart: pastWeek,
        dayOfWeek: 1,
        mealSlot: 'dinner',
        freeformTitle: 'Past Week Stew',
      })
      .set('Content-Type', 'application/json');
    expect(created.status).toBe(201);
    const pastEntryId = created.body.id as string;

    // "Navigate away" — a different week must NOT show the past week's meal.
    const away = await request(app!.server).get(
      `/api/v1/plans?weekStart=${otherWeek}`,
    );
    expect(away.status).toBe(200);
    expect(
      (away.body as Array<{ id: string }>).some((e) => e.id === pastEntryId),
    ).toBe(false);

    // "Navigate back" (cold cache) — the past week still has the meal, from DB.
    const back = await request(app!.server).get(
      `/api/v1/plans?weekStart=${pastWeek}`,
    );
    expect(back.status).toBe(200);
    const found = (
      back.body as Array<{
        id: string;
        weekStartDate: string;
        freeformTitle: string | null;
        dayOfWeek: number;
        mealSlot: string;
      }>
    ).find((e) => e.id === pastEntryId);
    expect(found).toBeDefined();
    expect(found?.weekStartDate).toBe(pastWeek);
    expect(found?.freeformTitle).toBe('Past Week Stew');
    expect(found?.dayOfWeek).toBe(1);
    expect(found?.mealSlot).toBe('dinner');
  });

  it('retains a year-boundary past week by Monday DATE (F-11)', async () => {
    // Monday 2025-12-29 is the week that spans into January 2026.
    const yearBoundaryWeek = '2025-12-29';

    const created = await request(app!.server)
      .post('/api/v1/plans')
      .send({
        // Post with a mid-week January date to prove server normalization back
        // to the December Monday (AD-2): Friday 2026-01-02.
        weekStart: '2026-01-02',
        dayOfWeek: 5,
        mealSlot: 'lunch',
        freeformTitle: 'New Year Leftovers',
      })
      .set('Content-Type', 'application/json');
    expect(created.status).toBe(201);
    expect(created.body.weekStartDate).toBe(yearBoundaryWeek);
    const id = created.body.id as string;

    // Revisit by the December Monday — the meal is there.
    const back = await request(app!.server).get(
      `/api/v1/plans?weekStart=${yearBoundaryWeek}`,
    );
    expect(back.status).toBe(200);
    expect(
      (back.body as Array<{ id: string }>).some((e) => e.id === id),
    ).toBe(true);

    // The persisted row is keyed by the December Monday DATE, not an ISO week.
    const { getDb } = await import('../db/client.js');
    const row = await getDb().execute(
      sql`SELECT week_start_date FROM plan_entries WHERE id = ${id} AND workspace_id = ${DEFAULT_WORKSPACE_ID}`,
    );
    expect(row.rows[0]).toMatchObject({ week_start_date: yearBoundaryWeek });
  });
});
