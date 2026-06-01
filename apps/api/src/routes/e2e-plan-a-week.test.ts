import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { errorEnvelopeSchema, type PlanEntry } from '@meal-tracking/shared';
import { DEFAULT_WORKSPACE_ID } from '../constants.js';

/**
 * STEP-23: end-to-end plan-a-week flow (AC-1.2/AC-1.3/AC-1.4).
 *
 * Bundles verify pieces; this proves the WIRED WHOLE. A user planning a week with
 * a MIX of recipe-based and freeform meals across several days/slots must see
 * them persist and RELOAD unchanged through the real stack (api -> drizzle ->
 * postgres), catching integration gaps the per-route/component tests miss
 * individually: week_start_date normalization (any in-week date -> the Monday,
 * AD-2), the week-keyed read (GET /plans?weekStart= returns exactly this week's
 * entries, no leakage), and the recipe/freeform XOR enforced on write (AD-3, S-1).
 *
 * Why an integration harness and not a browser e2e: the in-sandbox corporate TLS
 * proxy blocks Playwright browser downloads (the constraint recipe-library Bundle
 * 6 documented). This drives the SERVER stack with Supertest against a Dockerized
 * postgres over the EXACT endpoints the SPA calls (POST /plans add, GET /plans
 * week read) so the wired whole is exercised; the raw browser click-through is a
 * documented manual/Playwright check. It skips with a clear message when
 * DATABASE_URL is absent, matching the repo's DB-skip pattern; re-runs via
 * `npm test` (DB-backed) or `npm run e2e:planner` against a running postgres.
 */

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

if (!TEST_DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.log(
    'SKIP e2e-plan-a-week: DATABASE_URL not set (start a postgres and export DATABASE_URL to run the plan-a-week round-trip).',
  );
}

async function applyMigration(file: string): Promise<void> {
  const { getPool } = await import('../db/client.js');
  const here = dirname(fileURLToPath(import.meta.url));
  const sqlText = await readFile(join(here, '..', '..', 'drizzle', file), 'utf8');
  await getPool().query(sqlText);
}

/** The Monday DATE of the week under test, and a mid-week date in the SAME week. */
const WEEK = '2026-09-07'; // a Monday
const MID_WEEK = '2026-09-10'; // Thursday of the same week (proves normalization)
const OTHER_WEEK = '2026-09-14'; // the following Monday (proves no leakage)

interface PlannedSpec {
  dayOfWeek: number;
  mealSlot: string;
  kind: 'recipe' | 'freeform';
  /** recipe-backed entries carry this; freeform entries carry a title. */
  recipeId?: string;
  freeformTitle?: string;
  freeformDescription?: string;
  freeformLink?: string;
  /** weekStart to POST with (may be a mid-week date to exercise normalization). */
  weekStart: string;
}

describeDb('STEP-23 end-to-end plan-a-week (integration)', () => {
  let app: FastifyInstance | undefined;
  let recipeAId: string;
  let recipeBId: string;

  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');
    await applyMigration('0003_weekly_planner.sql');

    const { getDb } = await import('../db/client.js');
    const db = getDb();
    // Isolate this suite's data across re-runs.
    await db.execute(sql`DELETE FROM plan_entries WHERE week_start_date IN (${WEEK}, ${OTHER_WEEK})`);
    await db.execute(sql`DELETE FROM recipes WHERE name LIKE 'PAW %'`);

    const ra = await db.execute(
      sql`INSERT INTO recipes (workspace_id, name, meal_type, servings)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'PAW Overnight Oats', 'breakfast', 2)
          RETURNING id`,
    );
    recipeAId = ra.rows[0]?.id as string;
    const rb = await db.execute(
      sql`INSERT INTO recipes (workspace_id, name, meal_type, servings)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'PAW Chicken Bowl', 'dinner', 4)
          RETURNING id`,
    );
    recipeBId = rb.rows[0]?.id as string;

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

  it('plans a week of recipe + freeform meals across days/slots, then reloads them unchanged on the right day/slot', async () => {
    // A realistic week: two recipe-backed meals and two freeform meals spread
    // across distinct days and slots. One recipe meal is POSTed with a MID-WEEK
    // date to prove the server normalizes weekStart to the Monday (AD-2).
    const planned: PlannedSpec[] = [
      {
        weekStart: WEEK,
        dayOfWeek: 0,
        mealSlot: 'breakfast',
        kind: 'recipe',
        recipeId: recipeAId,
      },
      {
        weekStart: MID_WEEK, // Thursday in-week date -> must normalize to WEEK
        dayOfWeek: 4,
        mealSlot: 'dinner',
        kind: 'recipe',
        recipeId: recipeBId,
      },
      {
        weekStart: WEEK,
        dayOfWeek: 1,
        mealSlot: 'lunch',
        kind: 'freeform',
        freeformTitle: 'PAW Leftover Pasta',
        freeformDescription: 'from Sunday',
        freeformLink: 'https://example.com/pasta',
      },
      {
        weekStart: WEEK,
        dayOfWeek: 5,
        mealSlot: 'snack',
        kind: 'freeform',
        freeformTitle: 'PAW Trail Mix',
      },
    ];

    // 1. PLAN the week: POST each meal (the exact call the SPA's add/assign makes).
    const createdIds: string[] = [];
    for (const spec of planned) {
      const body: Record<string, unknown> = {
        weekStart: spec.weekStart,
        dayOfWeek: spec.dayOfWeek,
        mealSlot: spec.mealSlot,
      };
      if (spec.kind === 'recipe') {
        body.recipeId = spec.recipeId;
      } else {
        body.freeformTitle = spec.freeformTitle;
        if (spec.freeformDescription !== undefined)
          body.freeformDescription = spec.freeformDescription;
        if (spec.freeformLink !== undefined) body.freeformLink = spec.freeformLink;
      }
      const res = await request(app!.server)
        .post('/api/v1/plans')
        .send(body)
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(201);
      // Every entry persists keyed to the WEEK Monday, even the mid-week POST.
      expect(res.body.weekStartDate).toBe(WEEK);
      createdIds.push(res.body.id as string);
    }

    // 2. RELOAD the week (cold read from postgres) - GET /plans?weekStart=.
    const reload = await request(app!.server).get(
      `/api/v1/plans?weekStart=${WEEK}`,
    );
    expect(reload.status).toBe(200);
    const entries = reload.body as PlanEntry[];
    // Exactly the four planned meals are present (this suite isolates its week).
    const mine = entries.filter((e) => createdIds.includes(e.id));
    expect(mine).toHaveLength(4);

    // 3. Every meal is on its correct day/slot, with its content intact.
    const byDaySlot = (day: number, slot: string): PlanEntry | undefined =>
      mine.find((e) => e.dayOfWeek === day && e.mealSlot === slot);

    const monBreakfast = byDaySlot(0, 'breakfast');
    expect(monBreakfast?.recipeId).toBe(recipeAId);
    expect(monBreakfast?.freeformTitle).toBeNull();

    const thuDinner = byDaySlot(4, 'dinner');
    expect(thuDinner?.recipeId).toBe(recipeBId);
    expect(thuDinner?.weekStartDate).toBe(WEEK); // normalized from the mid-week POST

    const tueLunch = byDaySlot(1, 'lunch');
    expect(tueLunch?.recipeId).toBeNull();
    expect(tueLunch?.freeformTitle).toBe('PAW Leftover Pasta');
    expect(tueLunch?.freeformDescription).toBe('from Sunday');
    expect(tueLunch?.freeformLink).toBe('https://example.com/pasta');

    const satSnack = byDaySlot(5, 'snack');
    expect(satSnack?.recipeId).toBeNull();
    expect(satSnack?.freeformTitle).toBe('PAW Trail Mix');

    // 4. NO LEAKAGE: a different week does not show any of these entries.
    const other = await request(app!.server).get(
      `/api/v1/plans?weekStart=${OTHER_WEEK}`,
    );
    expect(other.status).toBe(200);
    expect(
      (other.body as PlanEntry[]).some((e) => createdIds.includes(e.id)),
    ).toBe(false);
  });

  it('rejects a both-recipe-and-freeform meal with a 400 envelope and persists nothing (XOR, AC-1.2)', async () => {
    const before = await request(app!.server).get(
      `/api/v1/plans?weekStart=${WEEK}`,
    );
    const beforeCount = (before.body as PlanEntry[]).length;

    const res = await request(app!.server)
      .post('/api/v1/plans')
      .send({
        weekStart: WEEK,
        dayOfWeek: 2,
        mealSlot: 'lunch',
        recipeId: recipeAId,
        freeformTitle: 'PAW Both Set',
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(errorEnvelopeSchema.safeParse(res.body).success).toBe(true);

    // Nothing was written: the week's entry count is unchanged.
    const after = await request(app!.server).get(
      `/api/v1/plans?weekStart=${WEEK}`,
    );
    expect((after.body as PlanEntry[]).length).toBe(beforeCount);
    expect(
      (after.body as PlanEntry[]).some((e) => e.freeformTitle === 'PAW Both Set'),
    ).toBe(false);
  });

  it('rejects a neither-recipe-nor-freeform meal with a 400 envelope (XOR, AC-1.2)', async () => {
    const res = await request(app!.server)
      .post('/api/v1/plans')
      .send({ weekStart: WEEK, dayOfWeek: 2, mealSlot: 'lunch' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(errorEnvelopeSchema.safeParse(res.body).success).toBe(true);
  });
});
