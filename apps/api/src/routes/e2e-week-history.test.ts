import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { PlanEntry } from '@meal-tracking/shared';
import { DEFAULT_WORKSPACE_ID } from '../constants.js';

/**
 * STEP-25: end-to-end week-history across a year boundary (AC-3.1, AC-3.3; F-11).
 *
 * The week-boundary bug (the prototype used ISO week-number math, F-11) is most
 * likely at a YEAR edge. This drives navigation backward/forward across the
 * 2025->2026 boundary and revisiting a past week THROUGH THE REAL STACK (api ->
 * drizzle -> postgres), asserting each week resolves by its Monday DATE and the
 * boundary week's meals are intact on return - the history guarantee end to end,
 * not just unit-level date math.
 *
 * Crucially, the navigation driver below mirrors the SAME pure UTC DATE
 * arithmetic the SPA's `shiftWeek` uses (apps/web/src/query/plans.ts -
 * normalize to the Monday, +/- 7 days, never ISO week-number math, AD-2/S-4),
 * so this proves the client's back/forward stepping and the server's
 * normalization AGREE across the year edge - the integration gap a unit test of
 * either half alone would miss. (The web workspace cannot be imported from the
 * api workspace; the function is replicated here verbatim and pinned to the
 * web's own plans.nav.test.ts, which unit-tests the canonical implementation.)
 *
 * Why an integration harness and not a browser e2e: the in-sandbox corporate TLS
 * proxy blocks Playwright browser downloads (recipe-library Bundle 6's
 * constraint). The raw browser back/forward click is a documented manual/
 * Playwright check; this drives the GET /plans week reads the navigation issues.
 * Skips with a clear message without DATABASE_URL; re-runs via `npm test`
 * (DB-backed) or `npm run e2e:planner`.
 */

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

if (!TEST_DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.log(
    'SKIP e2e-week-history: DATABASE_URL not set (start a postgres and export DATABASE_URL to run the year-boundary navigation).',
  );
}

async function applyMigration(file: string): Promise<void> {
  const { getPool } = await import('../db/client.js');
  const here = dirname(fileURLToPath(import.meta.url));
  const sqlText = await readFile(join(here, '..', '..', 'drizzle', file), 'utf8');
  await getPool().query(sqlText);
}

type WeekDirection = 'prev' | 'next';

/**
 * Mirror of the SPA's `shiftWeek` (apps/web/src/query/plans.ts): normalize the
 * given date to its week's Monday at UTC, then add/subtract exactly 7 days by
 * pure DATE arithmetic - never ISO week-number math, which mishandles the 52/53-
 * week year boundary (F-11). Replicated here because the web workspace is not
 * importable from the api workspace; the canonical version is unit-tested in
 * apps/web/src/query/plans.nav.test.ts.
 */
function shiftWeek(weekStart: string, direction: WeekDirection): string {
  const d = new Date(`${weekStart}T00:00:00.000Z`);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday + (direction === 'next' ? 7 : -7));
  return d.toISOString().slice(0, 10);
}

// The week that spans the 2025/2026 boundary: Monday 2025-12-29 .. Sunday
// 2026-01-04. Its NEXT week is the first full 2026 week (Monday 2026-01-05);
// its PREVIOUS week is the prior 2025 week (Monday 2025-12-22).
const BOUNDARY_WEEK = '2025-12-29';

/** Fetch a week's entries (the GET the SPA issues when a week becomes active). */
async function getWeek(app: FastifyInstance, weekStart: string): Promise<PlanEntry[]> {
  const res = await request(app.server).get(`/api/v1/plans?weekStart=${weekStart}`);
  expect(res.status).toBe(200);
  return res.body as PlanEntry[];
}

describeDb('STEP-25 end-to-end week-history across a year boundary (integration)', () => {
  let app: FastifyInstance | undefined;
  let boundaryEntryId: string;

  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');
    await applyMigration('0003_weekly_planner.sql');

    const { getDb } = await import('../db/client.js');
    // Isolate the three weeks this suite touches across re-runs.
    await getDb().execute(
      sql`DELETE FROM plan_entries WHERE week_start_date IN ('2025-12-22', '2025-12-29', '2026-01-05')`,
    );

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

  it('navigates forward into January and back across the year boundary; the boundary week keeps its meals (AC-3.1/AC-3.3, F-11)', async () => {
    // 1. Plan a meal in the boundary week. Post with a JANUARY in-week date
    //    (Fri 2026-01-02) to also prove the server normalizes back to the
    //    DECEMBER Monday (AD-2) - an ISO-week implementation would mis-key this.
    const created = await request(app!.server)
      .post('/api/v1/plans')
      .send({
        weekStart: '2026-01-02',
        dayOfWeek: 4,
        mealSlot: 'dinner',
        freeformTitle: 'WH New Year Roast',
      })
      .set('Content-Type', 'application/json');
    expect(created.status).toBe(201);
    expect(created.body.weekStartDate).toBe(BOUNDARY_WEEK);
    boundaryEntryId = created.body.id as string;

    // The active week starts at the boundary week, exactly as the UI would have
    // it after the POST. Confirm the meal is visible there.
    let active = BOUNDARY_WEEK;
    let week = await getWeek(app!, active);
    expect(week.some((e) => e.id === boundaryEntryId)).toBe(true);

    // 2. Navigate FORWARD one week (the SPA's "next" button -> shiftWeek). This
    //    crosses 2025 -> 2026: the next Monday is 2026-01-05, NOT an ISO
    //    week-53/week-01 artifact.
    active = shiftWeek(active, 'next');
    expect(active).toBe('2026-01-05');
    week = await getWeek(app!, active);
    // January's week resolves correctly and does NOT carry the boundary meal.
    expect(week.some((e) => e.id === boundaryEntryId)).toBe(false);

    // 3. Navigate BACK to the boundary week (the "prev" button). The Monday DATE
    //    returns to 2025-12-29, and the meal is intact (history retained, cold).
    active = shiftWeek(active, 'prev');
    expect(active).toBe(BOUNDARY_WEEK);
    week = await getWeek(app!, active);
    const found = week.find((e) => e.id === boundaryEntryId);
    expect(found).toBeDefined();
    expect(found?.weekStartDate).toBe(BOUNDARY_WEEK);
    expect(found?.freeformTitle).toBe('WH New Year Roast');
    expect(found?.dayOfWeek).toBe(4);
    expect(found?.mealSlot).toBe('dinner');

    // 4. Navigate to the PRIOR (2025) week. It resolves to Monday 2025-12-22 and
    //    is empty - proving each week resolves by its own Monday DATE (AC-3.1)
    //    with no leakage from the adjacent boundary week.
    const prior = shiftWeek(active, 'prev');
    expect(prior).toBe('2025-12-22');
    const priorWeek = await getWeek(app!, prior);
    expect(priorWeek.some((e) => e.id === boundaryEntryId)).toBe(false);
  });

  it('persists the boundary week keyed by its December Monday DATE, not an ISO week (F-11)', async () => {
    // The row itself is keyed by the December Monday DATE - the canonical guard
    // against the ISO-week regression.
    const { getDb } = await import('../db/client.js');
    const row = await getDb().execute(
      sql`SELECT week_start_date FROM plan_entries
          WHERE id = ${boundaryEntryId} AND workspace_id = ${DEFAULT_WORKSPACE_ID}`,
    );
    expect(row.rows[0]).toMatchObject({ week_start_date: BOUNDARY_WEEK });
  });
});
