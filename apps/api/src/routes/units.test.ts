import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { unitSchema } from '@meal-tracking/shared';

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * The full seeded reference set from 0001_baseline.sql. The test asserts the
 * endpoint returns exactly these rows FROM THE DB (not a hardcoded constant),
 * including that `qty` carries a null gramsPerUnit, so a stubbed response or a
 * drifted seed cannot pass (STEP-16 intent; AC-1.2, AC-1.3).
 */
const EXPECTED_UNITS = [
  { code: 'g', label: 'gram', gramsPerUnit: 1 },
  { code: 'tsp', label: 'teaspoon', gramsPerUnit: 5 },
  { code: 'tbsp', label: 'tablespoon', gramsPerUnit: 15 },
  { code: 'fl oz', label: 'fluid ounce', gramsPerUnit: 30 },
  { code: 'cup', label: 'cup', gramsPerUnit: 240 },
  { code: 'quart', label: 'quart', gramsPerUnit: 960 },
  { code: 'qty', label: 'quantity', gramsPerUnit: null },
];

describeDb('GET /api/v1/units (integration)', () => {
  let app: FastifyInstance | undefined;

  beforeAll(async () => {
    const { getPool } = await import('../db/client.js');
    const here = dirname(fileURLToPath(import.meta.url));
    const sqlText = await readFile(
      join(here, '..', '..', 'drizzle', '0001_baseline.sql'),
      'utf8',
    );
    await getPool().query(sqlText);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('returns the 7 seeded units from the DB, validated by the shared schema', async () => {
    const { buildServer } = await import('../server.js');
    app = await buildServer({ databaseUrl: TEST_DATABASE_URL! });
    await app.ready();

    const res = await request(app.server).get('/api/v1/units');
    expect(res.status).toBe(200);

    // Every row must satisfy the shared Unit schema (S-3).
    const parsed = z.array(unitSchema).safeParse(res.body);
    expect(parsed.success).toBe(true);

    expect(res.body).toHaveLength(7);

    // Order-independent comparison of the full seeded set.
    const byCode = Object.fromEntries(
      (res.body as Array<{ code: string }>).map((u) => [u.code, u]),
    );
    for (const expected of EXPECTED_UNITS) {
      expect(byCode[expected.code]).toEqual(expected);
    }

    // qty is the count-based unit with no mass conversion (must be null,
    // not 0 or missing).
    expect(byCode['qty']?.gramsPerUnit).toBeNull();
  });
});
