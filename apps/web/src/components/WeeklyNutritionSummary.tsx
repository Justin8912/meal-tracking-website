import { useMemo } from 'react';
import type { PlanEntry } from '@meal-tracking/shared';
import { useWeeklySummary } from '../query/plans.js';
import { MacroBar } from './MacroBar.js';

/**
 * Weekly nutrition summary (STEP-22, FR-5, AC-5.1/AC-5.2; AD-6).
 *
 * Renders the week's aggregated MACRO totals (calories/protein/carbs/fat/fiber)
 * and an explicit statement of which meals are NOT counted. The aggregation is
 * done SERVER-SIDE by GET /plans/summary via the shared nutrition-engine on
 * UNROUNDED per-serving values, rounded once at the server boundary (F-20, S-5);
 * this component renders those totals AS-IS and never re-rounds. Micronutrients/
 * %DV are not aggregated at the weekly level (AC-5.1), so none are shown.
 *
 * Freeform meals and recipe tombstones carry no nutrition; the server returns
 * their plan-entry ids in `excludedEntryIds`. This component maps those ids back
 * to the week's plan entries (passed in by the planner) to name each excluded
 * meal, so the user sees exactly what was left out rather than the meals being
 * silently dropped or zero-counted (AC-5.2).
 *
 * No emojis (S-7).
 */

export interface WeeklyNutritionSummaryProps {
  /** The active week's Monday DATE (AD-2); keys the summary query. */
  weekStart: string;
  /** The week's plan entries, used to name the excluded meals (AC-5.2). */
  entries: PlanEntry[];
}

/** Human label for an excluded entry: its freeform title or a removed-recipe note. */
function excludedLabel(entry: PlanEntry): string {
  if (entry.freeformTitle) {
    return entry.freeformTitle;
  }
  // recipe_id NULL + no freeform fields: the referenced recipe was deleted
  // (tombstone, AD-3). It is surfaced, not dropped.
  return 'Recipe removed';
}

export function WeeklyNutritionSummary({
  weekStart,
  entries,
}: WeeklyNutritionSummaryProps): JSX.Element {
  const summaryQuery = useWeeklySummary(weekStart);
  const summary = summaryQuery.data;

  // Map the excluded plan-entry ids to the week's entries so each not-counted
  // meal can be named. Entries not present in the passed list are skipped.
  const excludedEntries = useMemo(() => {
    const excludedIds = summary?.excludedEntryIds;
    if (!excludedIds) {
      return [];
    }
    const byId = new Map(entries.map((e) => [e.id, e]));
    return excludedIds
      .map((id) => byId.get(id))
      .filter((e): e is PlanEntry => e !== undefined);
  }, [summary, entries]);

  return (
    <section
      aria-label="Weekly nutrition summary"
      className="weekly-nutrition-summary"
    >
      <h2>Weekly nutrition</h2>

      {summaryQuery.isLoading ? (
        <p role="status">Computing weekly nutrition...</p>
      ) : summaryQuery.isError || !summary?.totals ? (
        <p role="alert">
          Could not load the weekly nutrition summary:{' '}
          {summaryQuery.error?.message ?? 'unknown error'}
        </p>
      ) : (
        <>
          {/* Macros only - no vitamins/minerals at the weekly level (AC-5.1). */}
          <dl className="macro-bars">
            <MacroBar
              variant="calories"
              label="Calories"
              value={summary.totals.calories}
              valueAriaLabel="Total calories"
            />
            <MacroBar
              variant="protein"
              label="Protein (g)"
              value={summary.totals.proteinG}
              valueAriaLabel="Total protein"
            />
            <MacroBar
              variant="carbs"
              label="Carbs (g)"
              value={summary.totals.carbsG}
              valueAriaLabel="Total carbs"
            />
            <MacroBar
              variant="fat"
              label="Fat (g)"
              value={summary.totals.fatG}
              valueAriaLabel="Total fat"
            />
            <MacroBar
              variant="fiber"
              label="Fiber (g)"
              value={summary.totals.fiberG}
              valueAriaLabel="Total fiber"
            />
          </dl>

          {/* State exactly which meals are not counted (AC-5.2). Only shown when
              something is excluded; an all-recipe week has no note. */}
          {excludedEntries.length > 0 ? (
            <p role="note" className="weekly-nutrition-summary__excluded">
              These meals are not counted in the totals (no nutrition data):{' '}
              <span>
                {excludedEntries.map((e, i) => (
                  <span key={e.id}>
                    {i > 0 ? ', ' : ''}
                    {excludedLabel(e)}
                  </span>
                ))}
              </span>
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
