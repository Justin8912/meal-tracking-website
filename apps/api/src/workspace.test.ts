import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_WORKSPACE_ID } from './constants.js';

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb('resolveWorkspaceId (integration)', () => {
  beforeAll(async () => {
    const { getPool } = await import('./db/client.js');
    const here = dirname(fileURLToPath(import.meta.url));
    const sqlText = await readFile(
      join(here, '..', 'drizzle', '0001_baseline.sql'),
      'utf8',
    );
    await getPool().query(sqlText);
  });

  afterAll(async () => {
    const { closeDb } = await import('./db/client.js');
    await closeDb();
  });

  it('returns the known seeded default workspace id', async () => {
    const { resolveWorkspaceId } = await import('./workspace.js');
    const { getDb } = await import('./db/client.js');
    const id = await resolveWorkspaceId(getDb());
    expect(id).toBe(DEFAULT_WORKSPACE_ID);
  });

  it('returns the same id stably across calls', async () => {
    const { resolveWorkspaceId } = await import('./workspace.js');
    const { getDb } = await import('./db/client.js');
    const first = await resolveWorkspaceId(getDb());
    const second = await resolveWorkspaceId(getDb());
    expect(first).toBe(second);
    expect(first).toBe(DEFAULT_WORKSPACE_ID);
  });
});
