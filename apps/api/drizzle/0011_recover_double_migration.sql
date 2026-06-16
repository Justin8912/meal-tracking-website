-- 0011: Recover plan_entries corrupted by migration 0010 running twice.
--
-- When 0010 ran twice, each non-Sunday entry was shifted an extra day:
--
--   Original Mon-Fri (old 0-4)  -> dayOfWeek+2, weekStartDate-2 (now falls on Saturday)
--   Original Sat (old 5)        -> dayOfWeek=0, weekStartDate+5 (Saturday)
--   Original Sun (old 6)        -> dayOfWeek=1, weekStartDate+5 (Saturday)
--
-- Detection: after a correct single run every weekStartDate is a Sunday
-- (EXTRACT(DOW)=0). Rows where DOW!=0 are double-shifted and need recovery.
-- Rows already on Sundays are correct and are not touched, so this migration
-- is safe to run on a clean (single-run) database.
--
-- Recovery (inverse of one extra run) per current state:
--   dayOfWeek 2-6, non-Sunday weekStartDate:  dayOfWeek-1, weekStartDate+1 day
--   dayOfWeek 0,   non-Sunday weekStartDate:  dayOfWeek=6, weekStartDate-6 days
--   dayOfWeek 1,   non-Sunday weekStartDate:  dayOfWeek=0, weekStartDate+1 day
UPDATE plan_entries
SET
  week_start_date = CASE
    WHEN day_of_week BETWEEN 2 AND 6 THEN week_start_date + INTERVAL '1 day'
    WHEN day_of_week = 0             THEN week_start_date - INTERVAL '6 days'
    WHEN day_of_week = 1             THEN week_start_date + INTERVAL '1 day'
    ELSE week_start_date
  END,
  day_of_week = CASE
    WHEN day_of_week BETWEEN 2 AND 6 THEN day_of_week - 1
    WHEN day_of_week = 0             THEN 6
    WHEN day_of_week = 1             THEN 0
    ELSE day_of_week
  END
WHERE EXTRACT(DOW FROM week_start_date::date) != 0;
