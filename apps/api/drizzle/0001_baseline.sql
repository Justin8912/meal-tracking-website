-- 0001_baseline.sql
-- Platform foundation baseline migration (AD-3, AD-4, S-5).
--
-- Creates and seeds the two foundation tables every feature table builds on:
--   * workspaces - the auth-ready tenant table; seeded with one default row
--     using a FIXED UUID so feature migrations and the server-side workspace
--     resolver can reference it (AD-4).
--   * units - the unit conversion reference set; grams_per_unit is NULL for
--     count-based units (qty).
--
-- The migration is idempotent: tables use IF NOT EXISTS and seed rows use
-- ON CONFLICT DO NOTHING, so re-applying it adds no duplicate rows.

CREATE TABLE IF NOT EXISTS workspaces (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS units (
    code            text PRIMARY KEY,
    label           text NOT NULL,
    grams_per_unit  numeric
);

-- Seed exactly one default workspace with a fixed, well-known UUID.
INSERT INTO workspaces (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default')
ON CONFLICT (id) DO NOTHING;

-- Seed the unit conversion set. qty has no mass conversion (grams_per_unit NULL).
INSERT INTO units (code, label, grams_per_unit) VALUES
    ('g',     'gram',        1),
    ('tsp',   'teaspoon',    5),
    ('tbsp',  'tablespoon',  15),
    ('fl oz', 'fluid ounce', 30),
    ('cup',   'cup',         240),
    ('quart', 'quart',       960),
    ('qty',   'quantity',    NULL)
ON CONFLICT (code) DO NOTHING;
