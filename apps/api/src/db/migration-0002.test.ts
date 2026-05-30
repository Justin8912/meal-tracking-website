import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import { DEFAULT_WORKSPACE_ID } from '../constants.js';

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * STEP-4 verify: 0002 extends baseline 0001. After applying 0001 then 0002 the
 * feature tables exist; the CHECK/FK constraints reject bad rows (servings=0,
 * out-of-enum meal_type, an unknown unit_code) so invalid data cannot persist
 * (S-4, S-5). The runner applies migrations in lexical order, so 0001 lands
 * first.
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

describeDb('0002_recipe_library migration (integration)', () => {
  beforeAll(async () => {
    await applyMigration('0001_baseline.sql');
    await applyMigration('0002_recipe_library.sql');
  });

  afterAll(async () => {
    const { closeDb } = await import('./client.js');
    await closeDb();
  });

  it('creates the feature tables', async () => {
    const { getDb } = await import('./client.js');
    const rows = await getDb().execute(
      sql`SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('ingredients','recipes','recipe_ingredients','tags','recipe_tags','usda_food_cache')`,
    );
    const names = rows.rows.map((r) => r.table_name).sort();
    expect(names).toEqual([
      'ingredients',
      'recipe_ingredients',
      'recipe_tags',
      'recipes',
      'tags',
      'usda_food_cache',
    ]);
  });

  it('rejects a recipe with servings = 0 via the CHECK constraint', async () => {
    const { getDb } = await import('./client.js');
    await expect(
      getDb().execute(
        sql`INSERT INTO recipes (workspace_id, name, meal_type, servings)
            VALUES (${DEFAULT_WORKSPACE_ID}, 'bad', 'breakfast', 0)`,
      ),
    ).rejects.toThrow();
  });

  it('rejects a recipe with an out-of-enum meal_type', async () => {
    const { getDb } = await import('./client.js');
    await expect(
      getDb().execute(
        sql`INSERT INTO recipes (workspace_id, name, meal_type, servings)
            VALUES (${DEFAULT_WORKSPACE_ID}, 'bad', 'brunch', 2)`,
      ),
    ).rejects.toThrow();
  });

  it('inserts a valid recipe', async () => {
    const { getDb } = await import('./client.js');
    const result = await getDb().execute(
      sql`INSERT INTO recipes (workspace_id, name, meal_type, servings)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'Oatmeal', 'breakfast', 2)
          RETURNING id, servings`,
    );
    expect(result.rows[0]).toMatchObject({ servings: 2 });
  });

  it('rejects a recipe_ingredient with an unknown unit_code via the FK', async () => {
    const { getDb } = await import('./client.js');
    const recipe = await getDb().execute(
      sql`INSERT INTO recipes (workspace_id, name, meal_type, servings)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'For FK', 'lunch', 1)
          RETURNING id`,
    );
    const recipeId = recipe.rows[0]?.id as string;
    const ingredient = await getDb().execute(
      sql`INSERT INTO ingredients (workspace_id, name, source)
          VALUES (${DEFAULT_WORKSPACE_ID}, 'Salt', 'custom')
          RETURNING id`,
    );
    const ingredientId = ingredient.rows[0]?.id as string;

    await expect(
      getDb().execute(
        sql`INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit_code)
            VALUES (${recipeId}, ${ingredientId}, 1, 'nonexistent-unit')`,
      ),
    ).rejects.toThrow();

    // A valid unit_code (seeded in 0001) is accepted.
    const ok = await getDb().execute(
      sql`INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit_code)
          VALUES (${recipeId}, ${ingredientId}, 1, 'g')
          RETURNING id`,
    );
    expect(ok.rows.length).toBe(1);
  });
});
