-- 0002_recipe_library.sql
-- Recipe-library feature migration (AD-2, S-4, S-5).
--
-- Extends the platform baseline 0001 (workspaces, units). It does NOT redefine
-- workspaces or units; it FKs to them. Every owned table carries a
-- workspace_id NOT NULL referencing workspaces.id (platform AD-4). The migrate
-- runner applies this after 0001 in lexical order.
--
-- Hybrid storage (F-10): macros live in typed columns; micronutrients live in a
-- JSONB absolute-mass map. CHECK constraints enforce the domain rules from the
-- design so bad rows cannot persist (servings >= 1; meal_type in the four
-- slots; ingredient source usda|custom).
--
-- The migration is idempotent: all tables use IF NOT EXISTS and indexes use
-- IF NOT EXISTS, so re-applying it is safe.

-- Ingredients owned by a workspace: USDA snapshots or custom entries.
CREATE TABLE IF NOT EXISTS ingredients (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL REFERENCES workspaces (id),
    name                text NOT NULL,
    source              text NOT NULL CHECK (source IN ('usda', 'custom')),
    -- USDA FoodData Central id; NULL for custom ingredients.
    fdc_id              text,
    -- Grams the stored nutrition is measured against (per-100g basis default).
    reference_grams     numeric NOT NULL DEFAULT 100,
    -- Usual mass of one count-based unit of this ingredient, when known (AD-4).
    gram_weight_per_qty numeric,
    -- Per-unit gram-equivalents for volume/qty conversion (AD-4); JSONB map.
    unit_gram_equivalents jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Macros on the reference-grams basis.
    calories            numeric,
    protein_g           numeric,
    carbs_g             numeric,
    fat_g               numeric,
    fiber_g             numeric,
    -- Micronutrients as an absolute-mass map (F-10); unknown nutrients omitted.
    micronutrients      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingredients_workspace_id
    ON ingredients (workspace_id);

-- Recipes owned by a workspace.
CREATE TABLE IF NOT EXISTS recipes (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    name         text NOT NULL,
    meal_type    text NOT NULL
        CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
    servings     integer NOT NULL CHECK (servings >= 1),
    notes        text,
    source_link  text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipes_workspace_id
    ON recipes (workspace_id);
CREATE INDEX IF NOT EXISTS idx_recipes_workspace_meal_type
    ON recipes (workspace_id, meal_type);

-- Recipe -> ingredient join with quantity, unit, and ordering.
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id     uuid NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
    ingredient_id uuid NOT NULL REFERENCES ingredients (id),
    quantity      numeric NOT NULL CHECK (quantity > 0),
    -- FK to the seeded unit reference set (0001); bad units cannot persist.
    unit_code     text NOT NULL REFERENCES units (code),
    position      integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id
    ON recipe_ingredients (recipe_id);

-- Tags owned by a workspace; label unique within a workspace.
CREATE TABLE IF NOT EXISTS tags (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    label        text NOT NULL,
    UNIQUE (workspace_id, label)
);

CREATE INDEX IF NOT EXISTS idx_tags_workspace_id
    ON tags (workspace_id);

-- Recipe <-> tag join.
CREATE TABLE IF NOT EXISTS recipe_tags (
    recipe_id uuid NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
    tag_id    uuid NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_tags_tag_id
    ON recipe_tags (tag_id);

-- USDA food-detail cache (pure accelerator; keyed by fdc_id) (AD-3, F-11).
CREATE TABLE IF NOT EXISTS usda_food_cache (
    fdc_id     text PRIMARY KEY,
    payload    jsonb NOT NULL,
    fetched_at timestamptz NOT NULL DEFAULT now()
);
