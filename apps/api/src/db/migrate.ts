import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPool, closeDb } from './client.js';

/**
 * Apply the versioned plain-SQL migrations in ./drizzle in lexical order
 * (S-5). Each migration is expected to be idempotent or guarded, so applying
 * the set repeatedly is safe (the baseline seed uses ON CONFLICT DO NOTHING).
 */
async function migrate(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(here, '..', '..', 'drizzle');

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pool = getPool();
  for (const file of files) {
    const sqlText = await readFile(join(migrationsDir, file), 'utf8');
    // eslint-disable-next-line no-console
    console.log(`Applying migration ${file}`);
    await pool.query(sqlText);
  }
  // eslint-disable-next-line no-console
  console.log(`Applied ${files.length} migration(s).`);
}

migrate()
  .then(() => closeDb())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('Migration failed:', err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  });
