import { describe, it, expect, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb('pooled Drizzle client (integration)', () => {
  afterAll(async () => {
    const { closeDb } = await import('./client.js');
    await closeDb();
  });

  it('executes SELECT 1 through the pool', async () => {
    const { getDb, getPool } = await import('./client.js');
    const db = getDb();
    const result = await db.execute(sql`SELECT 1 AS one`);
    expect(result.rows[0]).toMatchObject({ one: 1 });

    // Same pooled instance is reused (no per-request connection).
    const { getPool: getPool2 } = await import('./client.js');
    expect(getPool()).toBe(getPool2());
  });
});
