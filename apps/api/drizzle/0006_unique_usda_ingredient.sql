-- Prevent duplicate USDA snapshots per workspace (0006).
--
-- A USDA food is identified by its fdc_id; snapshotting the same fdc_id twice
-- for the same workspace produces redundant rows that appear as duplicates in
-- the ingredient list. This partial unique index (WHERE fdc_id IS NOT NULL)
-- prevents that at the DB level while leaving custom ingredients (fdc_id IS
-- NULL) unaffected — each custom ingredient is a distinct row even when two
-- have the same name.
--
-- Existing duplicate rows must be de-duplicated before this constraint can be
-- added. The query below keeps the oldest row per (workspace_id, fdc_id) pair
-- and deletes the rest. recipe_ingredients rows that pointed to deleted rows
-- are re-pointed to the surviving row via the same CTE.

-- 1. Re-point recipe_ingredients referencing non-canonical duplicates.
WITH ranked AS (
  SELECT
    id,
    workspace_id,
    fdc_id,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id, fdc_id
      ORDER BY created_at
    ) AS rn
  FROM ingredients
  WHERE fdc_id IS NOT NULL
),
canonical AS (
  SELECT workspace_id, fdc_id, id AS canonical_id
  FROM ranked
  WHERE rn = 1
),
duplicates AS (
  SELECT r.id AS dup_id, c.canonical_id
  FROM ranked r
  JOIN canonical c
    ON c.workspace_id = r.workspace_id
   AND c.fdc_id = r.fdc_id
  WHERE r.rn > 1
)
UPDATE recipe_ingredients ri
SET ingredient_id = d.canonical_id
FROM duplicates d
WHERE ri.ingredient_id = d.dup_id;

-- 2. Delete the now-orphaned duplicate ingredient rows.
WITH ranked AS (
  SELECT
    id,
    workspace_id,
    fdc_id,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id, fdc_id
      ORDER BY created_at
    ) AS rn
  FROM ingredients
  WHERE fdc_id IS NOT NULL
)
DELETE FROM ingredients
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3. Now it's safe to add the unique constraint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredients_workspace_fdc_id
  ON ingredients (workspace_id, fdc_id)
  WHERE fdc_id IS NOT NULL;
