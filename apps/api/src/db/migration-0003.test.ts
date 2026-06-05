import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import { DEFAULT_WORKSPACE_ID } from '../constants.js';

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * STEP-3 verify: migration 0003 extends the baseline 0001 + recipe-library
 * 0002 (AD-1) and must NOT redefine workspaces/units or the recipe-library
 * tables. After applying 0001 -> 0002 -> 0003 (lexical order, matching the
 * runner) the plan_entries table exists with its constraints:
 *  - the "not both" CHECK rejects a row that sets BOTH recipe_id and
 *    freeform_title;
 *  - a recipe-only and a freeform-only row insert;
 *  - day_of_week is constrained to 0..6 and meal_slot to the four slots;
 *  - deleting the referenced recipe leaves the entry as a tombstone with
 *    recipe_id NULL (ON DELETE SET NULL - AD-3), not deleted - so the CHECK
 *    must PERMIT the both-NULL tombstone state (a strict XOR would block the
 *    delete). The neither-on-insert rejection is owned by the shared Zod
 *    schema at the API boundary (S-1), covered by the STEP-1 schema tests.
 * Fails before STEP-3 (0003 not yet created).
 */
async function applyMigration(file: string): Promise<void> {
  const { getPool } = await import('./client.js');
  const here = dirname(fileURLToPath(import.meta.url));
  const sqlText = await readFile(
    join(here, '..', '..', 'drizzle', file),
    'utf8',
  );
  await getPool().query(sqlText);
}

describeDb('0003_weekly_planner migration (integration)', () => {
  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');
    await applyMigration('0003_weekly_planner.sql');
  });

  afterAll(async () => {
    const { closeDb } = await import('./client.js');
    await closeDb();
  });

  it('creates the plan_entries table', async () => {
    const { getDb } = await import('./client.js');
    const rows = await getDb().execute(
      sql`SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'plan_entries'`,
    );
    expect(rows.rows.length).toBe(1);
  });

  it('inserts a valid recipe-only entry', async () => {
    const { getDb } = await import('./client.js');
    const recipe = await getDb().execute(
      sql`INSERT INTO recipes (workspace_id, name, meal_type, servings)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'Plan Recipe', 'breakfast', 1)
          RETURNING id`,
    );
    const recipeId = recipe.rows[0]?.id as string;
    const result = await getDb().execute(
      sql`INSERT INTO plan_entries (workspace_id, week_start_date, day_of_week, meal_slot, recipe_id)
          VALUES (${DEFAULT_WORKSPACE_ID}, '2026-06-01', 0, 'breakfast', ${recipeId})
          RETURNING id, recipe_id`,
    );
    expect(result.rows[0]?.recipe_id).toBe(recipeId);
  });

  it('inserts a valid freeform-only entry', async () => {
    const { getDb } = await import('./client.js');
    const result = await getDb().execute(
      sql`INSERT INTO plan_entries (workspace_id, week_start_date, day_of_week, meal_slot, freeform_title)
          VALUES (${DEFAULT_WORKSPACE_ID}, '2026-06-01', 1, 'lunch', 'Leftovers')
          RETURNING id, freeform_title`,
    );
    expect(result.rows[0]?.freeform_title).toBe('Leftovers');
  });

  it('rejects a row that sets BOTH recipe_id and freeform_title via the "not both" CHECK', async () => {
    const { getDb } = await import('./client.js');
    const recipe = await getDb().execute(
      sql`INSERT INTO recipes (workspace_id, name, meal_type, servings)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'XOR Recipe', 'dinner', 1)
          RETURNING id`,
    );
    const recipeId = recipe.rows[0]?.id as string;
    await expect(
      getDb().execute(
        sql`INSERT INTO plan_entries (workspace_id, week_start_date, day_of_week, meal_slot, recipe_id, freeform_title)
            VALUES (${DEFAULT_WORKSPACE_ID}, '2026-06-01', 2, 'dinner', ${recipeId}, 'Both')`,
      ),
    ).rejects.toThrow();
  });

  it('PERMITS a both-NULL row so the ON DELETE SET NULL tombstone is legal (AD-3)', async () => {
    // The neither-set state is the tombstone produced by ON DELETE SET NULL; a
    // strict XOR would forbid it and block recipe deletion. The DB therefore
    // allows both-NULL; rejecting a neither-set row at INSERT time is the shared
    // Zod schema's job (S-1, covered by the STEP-1 schema tests).
    const { getDb } = await import('./client.js');
    const result = await getDb().execute(
      sql`INSERT INTO plan_entries (workspace_id, week_start_date, day_of_week, meal_slot)
          VALUES (${DEFAULT_WORKSPACE_ID}, '2026-06-01', 3, 'snack')
          RETURNING id`,
    );
    expect(result.rows.length).toBe(1);
  });

  it('rejects day_of_week 7 via the CHECK constraint', async () => {
    const { getDb } = await import('./client.js');
    await expect(
      getDb().execute(
        sql`INSERT INTO plan_entries (workspace_id, week_start_date, day_of_week, meal_slot, freeform_title)
            VALUES (${DEFAULT_WORKSPACE_ID}, '2026-06-01', 7, 'breakfast', 'Bad day')`,
      ),
    ).rejects.toThrow();
  });

  it('rejects an out-of-enum meal_slot via the CHECK constraint', async () => {
    const { getDb } = await import('./client.js');
    await expect(
      getDb().execute(
        sql`INSERT INTO plan_entries (workspace_id, week_start_date, day_of_week, meal_slot, freeform_title)
            VALUES (${DEFAULT_WORKSPACE_ID}, '2026-06-01', 0, 'brunch', 'Bad slot')`,
      ),
    ).rejects.toThrow();
  });

  it('leaves a tombstone (recipe_id NULL) when the referenced recipe is deleted (ON DELETE SET NULL)', async () => {
    const { getDb } = await import('./client.js');
    const recipe = await getDb().execute(
      sql`INSERT INTO recipes (workspace_id, name, meal_type, servings)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'Tombstone Recipe', 'dinner', 1)
          RETURNING id`,
    );
    const recipeId = recipe.rows[0]?.id as string;
    const entry = await getDb().execute(
      sql`INSERT INTO plan_entries (workspace_id, week_start_date, day_of_week, meal_slot, recipe_id)
          VALUES (${DEFAULT_WORKSPACE_ID}, '2026-06-08', 4, 'dinner', ${recipeId})
          RETURNING id`,
    );
    const entryId = entry.rows[0]?.id as string;

    await getDb().execute(sql`DELETE FROM recipes WHERE id = ${recipeId}`);

    const after = await getDb().execute(
      sql`SELECT id, recipe_id FROM plan_entries WHERE id = ${entryId}`,
    );
    // The entry survives (history preserved) with recipe_id set to NULL.
    expect(after.rows.length).toBe(1);
    expect(after.rows[0]?.recipe_id).toBeNull();
  });

  it('does not redefine the baseline or recipe-library tables (idempotent re-apply)', async () => {
    // Re-applying 0003 must be safe (IF NOT EXISTS) and must not touch
    // workspaces/units/recipes.
    await applyMigration('0003_weekly_planner.sql');
    const { getDb } = await import('./client.js');
    const seed = await getDb().execute(
      sql`SELECT id FROM workspaces WHERE id = ${DEFAULT_WORKSPACE_ID}`,
    );
    expect(seed.rows.length).toBe(1);
  });
});
