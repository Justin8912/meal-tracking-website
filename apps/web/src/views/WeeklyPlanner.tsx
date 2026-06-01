import type { PlanEntry } from '@meal-tracking/shared';
import { useWeekPlan } from '../query/plans.js';

/**
 * Weekly Planner view (FR-1, AD-4). Fills the platform's /planner placeholder
 * and proves the web->api read path.
 *
 * The week's plan is read through the useWeekPlan TanStack Query hook keyed by
 * the week's Monday DATE (AD-4), so Bundle 3 navigation reuses the cache rather
 * than a one-off fetch. The grid renders all seven days Monday..Sunday (AC-1.1)
 * even when empty; loading and empty-day states are explicit so the view is
 * never a blank screen. No emojis (S-7).
 *
 * The current week's Monday is computed client-side here; the server also
 * normalizes weekStart to the Monday (AD-2), so the two agree. Week navigation
 * (shifting the Monday by +/- 7 days) lands in Bundle 3.
 */

/** Day labels in grid order: Monday (dayOfWeek 0) .. Sunday (dayOfWeek 6). */
const DAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/**
 * The Monday DATE (YYYY-MM-DD) of the week containing `from`, computed at UTC so
 * it is timezone-independent and matches the server's normalization (AD-2).
 */
function mondayOf(from: Date): string {
  const d = new Date(
    Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()),
  );
  const dow = d.getUTCDay(); // 0=Sunday..6=Saturday
  const daysSinceMonday = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

/** Display label for a single plan entry (recipe name, freeform title, or tombstone). */
function entryLabel(entry: PlanEntry): string {
  if (entry.freeformTitle) {
    return entry.freeformTitle;
  }
  if (entry.recipeId) {
    return entry.recipeName ?? 'Recipe';
  }
  // recipe_id NULL + no freeform fields: the referenced recipe was deleted
  // (tombstone, AD-3). The slot is preserved, not dropped.
  return 'Recipe removed';
}

export function WeeklyPlanner(): JSX.Element {
  const weekStart = mondayOf(new Date());
  const { data: entries, isLoading, isError, error } = useWeekPlan(weekStart);

  // Group entries by day for O(1) per-day lookup when rendering the grid.
  const byDay = new Map<number, PlanEntry[]>();
  for (const entry of entries ?? []) {
    const list = byDay.get(entry.dayOfWeek) ?? [];
    list.push(entry);
    byDay.set(entry.dayOfWeek, list);
  }

  return (
    <section aria-labelledby="weekly-planner-heading">
      <h1 id="weekly-planner-heading">Weekly Planner</h1>
      <p>Week of {weekStart}</p>

      {isLoading ? (
        <p role="status">Loading this week&apos;s plan...</p>
      ) : isError ? (
        <p role="alert">
          Could not load the weekly plan: {error?.message ?? 'unknown error'}
        </p>
      ) : (
        <ol aria-label="Days of the week" className="weekly-planner__week">
          {DAY_LABELS.map((label, dayOfWeek) => {
            const dayEntries = byDay.get(dayOfWeek) ?? [];
            return (
              <li key={label} aria-label={label} className="weekly-planner__day">
                <h2>{label}</h2>
                {dayEntries.length === 0 ? (
                  <p className="weekly-planner__empty">No meals planned</p>
                ) : (
                  <ul aria-label={`${label} meals`}>
                    {dayEntries.map((entry) => (
                      <li key={entry.id}>
                        <span>{entryLabel(entry)}</span>
                        <span> ({entry.mealSlot})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
