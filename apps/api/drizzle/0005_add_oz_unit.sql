-- Add ounce (oz) as a weight unit (0005).
-- 1 oz = 28.35 g (avoirdupois). Unlike the volume units (tsp/cup/etc.) whose
-- gram conversion depends on ingredient density, oz is a fixed weight unit so
-- it has a single grams_per_unit value that applies to every ingredient.
INSERT INTO units (code, label, grams_per_unit)
VALUES ('oz', 'ounce', 28.35)
ON CONFLICT (code) DO NOTHING;
