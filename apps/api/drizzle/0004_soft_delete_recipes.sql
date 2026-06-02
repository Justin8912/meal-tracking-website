-- Soft delete for recipes (0004).
--
-- Instead of physically removing a recipe row (which would cascade-delete its
-- ingredient lines and orphan any weekly-plan entries that referenced it), we
-- stamp deleted_at so the Meal Library can filter them out while the weekly
-- planner can still resolve the recipe name and compute macros for historical
-- weeks. plan_entries.recipe_id stays non-NULL — no tombstone needed.
--
-- Existing rows get deleted_at = NULL (not deleted), which is the correct
-- default: NULL means "live"; a timestamp means "soft-deleted at that time".

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL;

-- Index so the common list query (WHERE deleted_at IS NULL) is fast.
CREATE INDEX IF NOT EXISTS idx_recipes_not_deleted
  ON recipes (workspace_id)
  WHERE deleted_at IS NULL;
