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
  if (!handle) {
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
