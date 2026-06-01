import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';

const { Pool } = pg;
import { getConfig } from '../config/env.js';
import * as schema from './schema.js';

/**
 * Pooled Postgres connection and Drizzle client.
 *
 * A single shared `pg.Pool` is used for the process lifetime; opening a
 * connection per request would exhaust Postgres under load (STEP-6 intent).
 * Credentials come only from config, which reads them from process.env (S-1).
 */

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  pool: pg.Pool;
  db: Db;
  close: () => Promise<void>;
}

/**
 * Create a fresh pooled Drizzle client for the given connection string. Used by
 * the server factory so tests can inject an alternate (or unreachable) DB.
 */
export function createDbHandle(databaseUrl: string): DbHandle {
  const pool = new Pool({ connectionString: databaseUrl });
  // An idle pg client can emit an async 'error' (e.g. an unreachable host, or a
  // connection dying as the pool is torn down). Without a listener pg promotes
  // it to an unhandledRejection that can surface against an unrelated later
  // operation (notably across test files that share the process). Swallowing it
  // here is safe: query-path failures still reject their own promise and are
  // handled by the caller / global error handler (AC-1.5).
  pool.on('error', () => {
    /* intentionally ignored: handled at the query call site */
  });
  const db = drizzle(pool, { schema });
  return {
    pool,
    db,
    close: async () => {
      await pool.end();
    },
  };
}

// Process-wide singleton used by CLI tooling (migrations) and default startup.
let handle: DbHandle | undefined;

function getHandle(): DbHandle {
  // Recreate the singleton if it was never built OR if its pool has been ended
  // (pg sets `ending`/`ended` after pool.end()). The latter guards a cross-file
  // race in the test suite: each DB test file's afterAll calls closeDb() on the
  // process-wide singleton, and `fileParallelism:false` only serializes file
  // start, not teardown - so a later file can call getDb() against a pool that
  // a prior file's afterAll just ended. Detecting the ended pool and rebuilding
  // transparently makes the shared client robust to that ordering. In
  // production closeDb() runs only on shutdown, so this never recreates there.
  const pool = handle?.pool as (pg.Pool & { ending?: boolean; ended?: boolean }) | undefined;
  if (!handle || pool?.ending || pool?.ended) {
    handle = createDbHandle(getConfig().databaseUrl);
  }
  return handle;
}

export function getPool(): pg.Pool {
  return getHandle().pool;
}

export function getDb(): Db {
  return getHandle().db;
}

/** Close the singleton pool. Used on graceful shutdown and in tests. */
export async function closeDb(): Promise<void> {
  if (handle) {
    await handle.close();
    handle = undefined;
  }
}

export { schema };
