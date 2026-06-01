-- 0003_weekly_planner.sql
-- Weekly-planner feature migration (AD-1, AD-2, AD-3, S-2, S-3, S-4).
--
-- Extends the platform baseline 0001 (workspaces, units) and coexists with the
-- recipe-library 0002 (recipes, ingredients, tags). It does NOT redefine any of
-- those tables; it only FKs to them. The migrate runner applies this after 0001
-- and 0002 in lexical order.
--
-- This migration adds the single plan_entries table (F-12). A plan entry is a
-- thin association of (week, day, slot, position) to a meal that is EITHER a
-- saved recipe OR a freeform entry:
--   * week_start_date is the Monday DATE of the week, computed server-side
--     (AD-2, S-4) - never an ISO week string (avoids the year-boundary bug).
--   * day_of_week is 0 (Monday) .. 6 (Sunday), CHECK-constrained.
--   * meal_slot is CHECK-constrained to the four slots.
--   * recipe_id FKs to recipes(id) ON DELETE SET NULL so deleting a recipe in
--     recipe-library leaves the planned slot as a tombstone (recipe_id NULL),
--     never cascading the plan away or orphaning it (AD-3).
--   * A "not both" CHECK enforces that a row never carries BOTH a recipe_id and
--     a freeform_title, defence-in-depth alongside the shared Zod refinement
--     (S-1) so a both-set row can never persist even if a future caller
--     bypasses validation. The CHECK deliberately PERMITS the both-NULL state:
--     that is exactly the tombstone produced by ON DELETE SET NULL when a
--     referenced recipe is deleted (AD-3). A strict XOR would make
--     ON DELETE SET NULL violate its own constraint and block recipe deletion,
--     erasing planning history - the opposite of the tombstone intent. The
--     "exactly one on insert" half of the XOR (rejecting a neither-set NEW row)
--     is owned by the shared Zod schema at the API boundary (S-1), which a
--     post-deletion tombstone never passes through.
-- Index (workspace_id, week_start_date) makes the week query and the history
-- range-query fast (NFR-1).
--
-- The migration is idempotent: the table uses IF NOT EXISTS and the index uses
-- IF NOT EXISTS, so re-applying it is safe.

CREATE TABLE IF NOT EXISTS plan_entries (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL REFERENCES workspaces (id),
    -- The Monday DATE of the week this entry belongs to (AD-2, S-4).
    week_start_date      date NOT NULL,
    -- 0 (Monday) .. 6 (Sunday).
    day_of_week          smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    meal_slot            text NOT NULL
        CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
    -- Ordering within a day/slot.
    position             integer NOT NULL DEFAULT 0,
    -- Recipe-backed meal; NULL for a freeform meal or after the recipe is
    -- deleted (tombstone, AD-3).
    recipe_id            uuid REFERENCES recipes (id) ON DELETE SET NULL,
    -- Freeform meal fields; freeform_title is the discriminator for the XOR.
    freeform_title       text,
    freeform_description text,
    freeform_link        text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    -- A row must never carry BOTH a recipe_id and a freeform_title (AD-3). The
    -- both-NULL state is permitted: it is the tombstone left by ON DELETE SET
    -- NULL on recipe deletion (a strict XOR would block that delete). The
    -- neither-on-insert case is rejected by the shared Zod schema (S-1).
    CONSTRAINT plan_entries_recipe_xor_freeform
        CHECK (NOT (recipe_id IS NOT NULL AND freeform_title IS NOT NULL))
);

-- The week query and history range-query filter by (workspace_id,
-- week_start_date) (NFR-1).
CREATE INDEX IF NOT EXISTS idx_plan_entries_workspace_week
    ON plan_entries (workspace_id, week_start_date);
