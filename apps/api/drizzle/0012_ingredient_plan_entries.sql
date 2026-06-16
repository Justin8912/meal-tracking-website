-- 0012: support ingredient-backed plan entries.
--
-- Extends plan_entries with three columns so a user can plan a single
-- ingredient (e.g. "100g oats") without creating a throwaway recipe.
-- The existing "not both recipe + freeform" check is widened to "at most one
-- of {recipe_id, freeform_title, ingredient_id} is non-null", preserving the
-- tombstone state (all three NULL after ON DELETE SET NULL on recipe_id).

-- Drop the old two-way constraint (known name from migration 0003).
ALTER TABLE plan_entries
  DROP CONSTRAINT IF EXISTS plan_entries_recipe_xor_freeform;

-- Add ingredient columns.
ALTER TABLE plan_entries
  ADD COLUMN IF NOT EXISTS ingredient_id        UUID REFERENCES ingredients (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ingredient_quantity  NUMERIC,
  ADD COLUMN IF NOT EXISTS ingredient_unit_code TEXT REFERENCES units (code);

-- Three-way "at most one" constraint. The both/all-NULL tombstone is still
-- permitted (same reasoning as the original two-way check in 0003).
ALTER TABLE plan_entries
  ADD CONSTRAINT plan_entries_entry_type_check CHECK (
    (CASE WHEN recipe_id     IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN freeform_title IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN ingredient_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  );
