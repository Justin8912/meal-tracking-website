-- Backfill calories for ingredient rows where calories is NULL but macros are
-- present (0007). These were snapshotted before the Atwater derivation was
-- added to the mapper, so the engine was treating them as 0-calorie ingredients.
--
-- Atwater General Factors: 1g protein = 4 kcal, 1g carbs = 4 kcal, 1g fat = 9 kcal.
-- Only update rows where at least one macro is non-null (avoids fabricating 0).
-- Rounds to one decimal place to match the mapper's output format.
UPDATE ingredients
SET calories = ROUND(
  CAST(
    COALESCE(CAST(protein_g AS numeric), 0) * 4
    + COALESCE(CAST(carbs_g AS numeric), 0) * 4
    + COALESCE(CAST(fat_g AS numeric), 0) * 9
  AS numeric),
  1
)
WHERE calories IS NULL
  AND (protein_g IS NOT NULL OR carbs_g IS NOT NULL OR fat_g IS NOT NULL);
