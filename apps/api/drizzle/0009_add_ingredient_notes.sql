-- 0009: add notes column to ingredients
-- A free-text notes field for both custom and USDA-snapshotted ingredients.
-- Nullable so existing rows are unaffected.
ALTER TABLE ingredients ADD COLUMN notes text;
