import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPool, closeDb } from './client.js';

/**
 * Migrations that existed before the schema_migrations tracking table was
 * introduced. On an upgrade (tables already present), these are marked as
 * applied without re-running them — they have already been executed.
 */
const PRE_TRACKING_MIGRATIONS = new Set([
  '0001_baseline.sql',
  '0002_recipe_library.sql',
  '0003_weekly_planner.sql',
  '0004_soft_delete_recipes.sql',
  '0005_add_oz_unit.sql',
  '0006_unique_usda_ingredient.sql',
  '0007_backfill_atwater_calories.sql',
  '0008_ingredient_preferred_unit.sql',
  '0009_add_ingredient_notes.sql',
  '0010_sunday_week_start.sql',
]);

/**
 * Apply the versioned plain-SQL migrations in ./drizzle in lexical order.
 *
 * A schema_migrations tracking table records which files have been applied so
 * each migration runs exactly once. On a fresh install all files run. On an
 * upgrade the tracking table is bootstrapped with the pre-tracking migration
 * list to avoid re-running files that already executed before tracking existed.
 */
async function migrate(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(here, '..', '..', 'drizzle');

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pool = getPool();

  // Create the tracking table if it does not yet exist.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Determine whether this is a fresh install or an upgrade of an existing DB.
  // We check for the workspaces table (created by 0001) as the baseline marker.
  const { rows: tableCheck } = await pool.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'workspaces'
    ) AS exists
  `);
  const isExistingDb = tableCheck[0]?.exists === true;

  if (isExistingDb) {
    // Mark all pre-tracking migrations as applied so they are not re-run.
    for (const file of PRE_TRACKING_MIGRATIONS) {
      await pool.query(
        `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
        [file],
      );
    }
  }

  // Load the set of already-applied migrations.
  const { rows: appliedRows } = await pool.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations',
  );
  const applied = new Set(appliedRows.map((r) => r.filename));

  let newCount = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const sqlText = await readFile(join(migrationsDir, file), 'utf8');
    // eslint-disable-next-line no-console
    console.log(`Applying migration ${file}`);
    await pool.query(sqlText);
    await pool.query(
      `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
      [file],
    );
    newCount++;
  }

  if (newCount === 0) {
    // eslint-disable-next-line no-console
    console.log('All migrations already applied.');
  } else {
    // eslint-disable-next-line no-console
    console.log(`Applied ${newCount} new migration(s).`);
  }
}

migrate()
  .then(() => closeDb())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('Migration failed:', err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  });
