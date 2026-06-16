-- 0010: change week start from Monday to Sunday.
--
-- Previously dayOfWeek 0=Monday..6=Sunday and week_start_date was always
-- the Monday of the week. This migration converts all existing plan entries
-- to the new convention where 0=Sunday..6=Saturday and week_start_date is
-- the Sunday of the week.
--
-- Conversion rules per old dayOfWeek:
--   0..5 (Mon-Sat): week_start_date shifts back 1 day (to the previous Sunday),
--                   day_of_week increments by 1.
--   6 (Sun):        week_start_date advances 6 days (to the following Sunday,
--                   which is now that day's week start), day_of_week becomes 0.
UPDATE plan_entries
SET
  week_start_date = CASE
    WHEN day_of_week = 6 THEN week_start_date + INTERVAL '6 days'
    ELSE week_start_date - INTERVAL '1 day'
  END,
  day_of_week = CASE
    WHEN day_of_week = 6 THEN 0
    ELSE day_of_week + 1
  END;
