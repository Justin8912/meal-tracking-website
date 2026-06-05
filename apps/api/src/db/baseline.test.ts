import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import { DEFAULT_WORKSPACE_ID } from '../constants.js';

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

async function applyBaseline(): Promise<void> {
  const { getPool } = await import('./client.js');
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, '..', '..', 'drizzle', '0001_baseline.sql');
  const sqlText = await readFile(file, 'utf8');
  await getPool().query(sqlText);
}

describeDb('0001_baseline migration and seed (integration)', () => {
  beforeAll(async () => {
    await applyBaseline();
  });

  afterAll(async () => {
    const { closeDb } = await import('./client.js');
    await closeDb();
  });

  it('seeds exactly one default workspace with the known UUID', async () => {
    const { getDb } = await import('./client.js');
    const rows = await getDb().execute(
      sql`SELECT id, name FROM workspaces`,
    );
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0]).toMatchObject({
      id: DEFAULT_WORKSPACE_ID,
      name: 'Default',
    });
  });

  it('seeds 7 unit rows with qty.grams_per_unit NULL', async () => {
    const { getDb } = await import('./client.js');
    const count = await getDb().execute(sql`SELECT count(*)::int AS n FROM units`);
    expect(count.rows[0]).toMatchObject({ n: 7 });

    const qty = await getDb().execute(
      sql`SELECT grams_per_unit FROM units WHERE code = 'qty'`,
    );
    expect(qty.rows[0]).toMatchObject({ grams_per_unit: null });

    const g = await getDb().execute(
      sql`SELECT grams_per_unit FROM units WHERE code = 'g'`,
    );
    // numeric comes back as a string from pg.
    expect(Number(g.rows[0]?.grams_per_unit)).toBe(1);
  });

  it('is idempotent: re-applying adds no duplicate rows', async () => {
    await applyBaseline();
    const { getDb } = await import('./client.js');
    const ws = await getDb().execute(sql`SELECT count(*)::int AS n FROM workspaces`);
    const u = await getDb().execute(sql`SELECT count(*)::int AS n FROM units`);
    expect(ws.rows[0]).toMatchObject({ n: 1 });
    expect(u.rows[0]).toMatchObject({ n: 7 });
  });
});
