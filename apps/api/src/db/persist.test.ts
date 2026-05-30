import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import { pgTable, uuid, text } from 'drizzle-orm/pg-core';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { errorEnvelopeSchema } from '@meal-tracking/shared';
import { DEFAULT_WORKSPACE_ID } from '../constants.js';

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * A throwaway workspace-scoped table used only to exercise the generic persist
 * helper end to end. It FKs to workspaces.id exactly like a real feature table
 * (AD-4) so the helper's workspace scoping is genuinely tested.
 */
const persistProbe = pgTable('persist_probe', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  label: text('label').notNull(),
});

describeDb('persist helper (integration)', () => {
  beforeAll(async () => {
    const { getPool } = await import('../db/client.js');
    const here = dirname(fileURLToPath(import.meta.url));
    const sqlText = await readFile(
      join(here, '..', '..', 'drizzle', '0001_baseline.sql'),
      'utf8',
    );
    await getPool().query(sqlText);
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS persist_probe (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id),
        label text NOT NULL
      );
    `);
  });

  afterAll(async () => {
    const { getPool, closeDb } = await import('../db/client.js');
    await getPool().query('DROP TABLE IF EXISTS persist_probe;');
    await closeDb();
  });

  it('persists a workspace-scoped record and returns it (round-trips)', async () => {
    const { persist } = await import('./persist.js');
    const { getDb } = await import('../db/client.js');
    const db = getDb();

    const created = await persist(db, persistProbe, {
      label: 'round-trip',
    });

    expect(created.id).toBeTruthy();
    expect(created.workspaceId).toBe(DEFAULT_WORKSPACE_ID);
    expect(created.label).toBe('round-trip');

    // Read it back independently to prove it was actually committed (AC-1.1).
    const rows = await db
      .select()
      .from(persistProbe)
      .where(sql`${persistProbe.id} = ${created.id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe('round-trip');
  });

  it('throws PersistenceError that is set on the helper', async () => {
    const { persist, PersistenceError } = await import('./persist.js');
    const { createDbHandle } = await import('../db/client.js');

    // A pool pointed at an unreachable host forces a DB error mid-write.
    const broken = createDbHandle('postgres://postgres:postgres@127.0.0.1:1/nope');

    await expect(
      persist(broken.db, persistProbe, { label: 'will-fail' }),
    ).rejects.toBeInstanceOf(PersistenceError);

    await broken.close();
  });

  describe('through the Fastify global error handler', () => {
    let app: FastifyInstance | undefined;

    afterEach(async () => {
      if (app) {
        await app.close();
        app = undefined;
      }
    });

    it('a forced DB failure surfaces as a 5xx error envelope, never a false success', async () => {
      const { persist } = await import('./persist.js');
      const { buildServer } = await import('../server.js');

      // Build a real server (with the global error handler) but route a write
      // through a separate, unreachable pool to force the failure.
      app = await buildServer({ databaseUrl: TEST_DATABASE_URL! });
      const { createDbHandle } = await import('../db/client.js');
      const broken = createDbHandle(
        'postgres://postgres:postgres@127.0.0.1:1/nope',
      );

      app.post('/__test/persist-fail', async () => {
        // No try/catch: a swallowed error or a 200 here would fail the test.
        const record = await persist(broken.db, persistProbe, {
          label: 'will-fail',
        });
        return { ok: true, record };
      });
      await app.ready();

      const res = await request(app.server).post('/__test/persist-fail');

      // Must be a server error, not a false success.
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(res.body.ok).toBeUndefined();

      // Must be the shared error envelope, not a crash/HTML page.
      const parsed = errorEnvelopeSchema.safeParse(res.body);
      expect(parsed.success).toBe(true);
      expect(res.body.error.code).toBeTruthy();
      expect(res.body.error.message).toBeTruthy();

      await broken.close();
    });
  });
});
