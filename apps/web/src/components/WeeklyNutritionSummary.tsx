import { useState, useMemo } from 'react';
import type { PlanEntry } from '@meal-tracking/shared';
import { useWeeklySummary, useDailyNutrition, type DayNutrition } from '../query/plans.js';

/**
 * Weekly nutrition summary — tabbed daily view.
 *
 * Layout:
 *   1. Average per day bar (from weekly total ÷ days with data)
 *   2. Day tabs (Mon–Sun) — select a day to see that day's planned meals
 *      and their per-meal calorie/macro breakdown from the server.
 *
 * Server computes nutrition via the shared engine on unrounded per-serving
 * values; this component renders those totals as-is and never re-rounds.
 * No emojis (S-7).
 */

const DAY_LABELS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export interface WeeklyNutritionSummaryProps {
  weekStart: string;
  entries: PlanEntry[];
  /** When set, skip the day-tab UI and show only this day (0=Sun…6=Sat). */
  singleDay?: number;
}

function entryLabel(entry: PlanEntry): string {
  if (entry.ingredientId) {
    const name = entry.ingredientName ?? 'Ingredient';
    const qty = entry.ingredientQuantity;
    const unit = entry.ingredientUnitCode;
    return qty != null ? `${name} (${qty}${unit})` : name;
  }
  return entry.freeformTitle ?? entry.recipeName ?? 'Recipe removed';
}

function isExcluded(entry: PlanEntry): boolean {
  // Freeform meals and tombstones have no nutrition; ingredient and recipe
  // entries both contribute real macros and are counted.
  return entry.freeformTitle != null ||
    (!entry.recipeId && !entry.freeformTitle && !entry.ingredientId);
}

/** A single pill showing a macro value. */
function MacroPill({
  value,
  unit,
  className,
}: {
  value: number;
  unit: string;
  className: string;
}): JSX.Element {
  return (
    <span className={`nutrition-pill ${className}`}>
      {value} {unit}
    </span>
  );
}

export function WeeklyNutritionSummary({
  weekStart,
  entries,
  singleDay,
}: WeeklyNutritionSummaryProps): JSX.Element {
  const [activeDay, setActiveDay] = useState<number>(0);
  const displayDay = singleDay ?? activeDay;

  const summaryQuery = useWeeklySummary(weekStart);
  const dailyQuery = useDailyNutrition(weekStart);

  // Group entries by day for the tab panel
  const byDay = useMemo(() => {
    const map = new Map<number, PlanEntry[]>();
    for (const e of entries) {
      const list = map.get(e.dayOfWeek) ?? [];
      list.push(e);
      map.set(e.dayOfWeek, list);
    }
    return map;
  }, [entries]);

  // Average per day from the weekly server total
  const avgPerDay = useMemo(() => {
    const totals = summaryQuery.data?.totals;
    if (!totals) return null;
    const daily = Array.isArray(dailyQuery.data) ? dailyQuery.data : [];
    const daysWithData = daily.filter((d) => d.hasData).length || 1;
    const div = (n: number) => Math.round((n / daysWithData) * 10) / 10;
    return {
      calories: div(totals.calories),
      proteinG: div(totals.proteinG),
      carbsG: div(totals.carbsG),
      fatG: div(totals.fatG),
      fiberG: div(totals.fiberG),
    };
  }, [summaryQuery.data, dailyQuery.data]);

  // The active day's server-computed totals
  const activeDayData: DayNutrition | undefined = dailyQuery.data?.[displayDay];
  const activeDayEntries = byDay.get(displayDay) ?? [];
  const activeDayIncluded = activeDayEntries.filter((e) => !isExcluded(e));
  const activeDayExcluded = activeDayEntries.filter(isExcluded);

  const isLoading = summaryQuery.isLoading || dailyQuery.isLoading;

  return (
    <section aria-label="Weekly nutrition summary" className="weekly-nutrition-summary">
      <h2>Weekly nutrition</h2>

      {isLoading ? (
        <p role="status">Computing nutrition...</p>
      ) : (
        <>
          {/* ── Average per day ─────────────────────────────────────────── */}
          {avgPerDay ? (
            <div className="weekly-nutrition-summary__avg">
              <p className="weekly-nutrition-summary__avg-label">
                Daily average
                <span className="weekly-nutrition-summary__avg-sub">
                  across days with meals
                </span>
              </p>
              <div className="weekly-nutrition-summary__avg-pills">
                <MacroPill value={avgPerDay.calories} unit="kcal" className="nutrition-pill--cal" />
                <MacroPill value={avgPerDay.proteinG} unit="g protein" className="nutrition-pill--protein" />
                <MacroPill value={avgPerDay.carbsG} unit="g carbs" className="nutrition-pill--carbs" />
                <MacroPill value={avgPerDay.fatG} unit="g fat" className="nutrition-pill--fat" />
                <MacroPill value={avgPerDay.fiberG} unit="g fiber" className="nutrition-pill--fiber" />
              </div>
            </div>
          ) : null}

          {/* ── Day tabs (hidden when a single day is pinned) ───────────── */}
          <div className="day-nutrition">
            {singleDay === undefined ? (
              <div className="day-nutrition__tabs" role="tablist" aria-label="Select day">
                {DAY_ABBR.map((abbr, i) => {
                  const hasEntries = (byDay.get(i) ?? []).length > 0;
                  const isActive = activeDay === i;
                  return (
                    <button
                      key={abbr}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={[
                        'day-nutrition__tab',
                        isActive ? 'day-nutrition__tab--active' : '',
                        hasEntries ? 'day-nutrition__tab--has-data' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => setActiveDay(i)}
                    >
                      {abbr}
                      {hasEntries ? <span className="day-nutrition__tab-dot" aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Day panel */}
            <div
              role={singleDay === undefined ? 'tabpanel' : undefined}
              aria-label={DAY_LABELS[displayDay]}
              className="day-nutrition__panel"
            >
              <h3 className="day-nutrition__day-title">{DAY_LABELS[displayDay]}</h3>

              {activeDayEntries.length === 0 ? (
                <p className="day-nutrition__empty">No meals planned.</p>
              ) : (
                <>
                  {/* Day total bar (from server) */}
                  {activeDayData?.hasData ? (
                    <div className="day-nutrition__totals">
                      <MacroPill value={activeDayData.calories} unit="kcal" className="nutrition-pill--cal" />
                      <MacroPill value={activeDayData.proteinG} unit="g protein" className="nutrition-pill--protein" />
                      <MacroPill value={activeDayData.carbsG} unit="g carbs" className="nutrition-pill--carbs" />
                      <MacroPill value={activeDayData.fatG} unit="g fat" className="nutrition-pill--fat" />
                      <MacroPill value={activeDayData.fiberG} unit="g fiber" className="nutrition-pill--fiber" />
                    </div>
                  ) : null}

                  {/* Meal list */}
                  <ul className="day-nutrition__meals">
                    {activeDayIncluded.map((entry) => (
                      <li key={entry.id} className="day-nutrition__meal">
                        <span className="day-nutrition__meal-name">{entryLabel(entry)}</span>
                        <span className="day-nutrition__meal-slot">{entry.mealSlot}</span>
                      </li>
                    ))}
                    {activeDayExcluded.map((entry) => (
                      <li key={entry.id} className="day-nutrition__meal day-nutrition__meal--excluded">
                        <span className="day-nutrition__meal-name">{entryLabel(entry)}</span>
                        <span className="day-nutrition__meal-badge">no nutrition data</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
