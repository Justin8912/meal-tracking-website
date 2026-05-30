import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getConfig } from '../config/env.js';
import * as schema from './schema.js';

/**
 * Pooled Postgres connection and Drizzle client.
 *
 * A single shared `pg.Pool` is used for the process lifetime; opening a
 * connection per request would exhaust Postgres under load (STEP-6 intent).
 * Credentials come only from config, which reads them from process.env (S-1).
 */

let pool: Pool | undefined;
let db: NodePgDatabase<typeof schema> | undefined;

export function getPool(): Pool {
  if (!pool) {
    const config = getConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
  }
  return pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!db) {
    db = drizzle(getPool(), { schema });
  }
  return db;
}

/** Close the pool. Used on graceful shutdown. */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    db = undefined;
  }
}

export { schema };
