import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { shiftWeek, useNutritionHistory, useDailyNutrition } from '../query/plans.js';

/**
 * NutritionTrends — macro intake over time via a Recharts line chart.
 *
 * Two granularities:
 *   - 2 months (default): 8 weekly data points, each point = that week's totals
 *   - 1 week: 7 daily data points from the existing daily-summary endpoint
 *
 * Legend click isolates a single nutrient; clicking it again restores all.
 * Y-axis domain is computed dynamically with 15% headroom above the max
 * visible value, snapped to a "nice" step size.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

type MacroKey = 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG';

const MACROS: { key: MacroKey; label: string; color: string; unit: string }[] = [
  { key: 'calories', label: 'Calories',  color: '#d29922', unit: 'kcal' },
  { key: 'proteinG', label: 'Protein',   color: '#e07b39', unit: 'g' },
  { key: 'carbsG',   label: 'Carbs',     color: '#58a6ff', unit: 'g' },
  { key: 'fatG',     label: 'Fat',       color: '#bc8cff', unit: 'g' },
  { key: 'fiberG',   label: 'Fiber',     color: '#3fb950', unit: 'g' },
];

// Day labels for the 1-week view (Monday-start to match the rest of main).
const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns the Monday of the current UTC week as YYYY-MM-DD. */
function mondayOf(from: Date): string {
  const d = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Compute a "nice" Y-axis ceiling with ~15% headroom.
 * Snaps up to the nearest step size that fits the magnitude.
 */
function niceMax(maxValue: number): number {
  if (maxValue <= 0) return 100;
  const withHeadroom = maxValue * 1.15;
  const step =
    maxValue <= 50  ? 10  :
    maxValue <= 200 ? 25  :
    maxValue <= 500 ? 50  : 100;
  return Math.ceil(withHeadroom / step) * step;
}

/** Short label for a week start date: "Jun 1" */
function weekLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

type Granularity = '2month' | '1week';

export function NutritionTrends(): JSX.Element {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [granularity, setGranularity] = useState<Granularity>('2month');
  const [isolated, setIsolated] = useState<MacroKey | null>(null);

  const historyQuery = useNutritionHistory(weekStart, 8);
  const dailyQuery   = useDailyNutrition(weekStart);

  // Transform server data into the flat objects Recharts expects.
  const chartData = useMemo(() => {
    if (granularity === '2month') {
      return (historyQuery.data ?? []).map((w) => ({
        label: weekLabel(w.weekStartDate),
        calories: w.calories,
        proteinG: w.proteinG,
        carbsG:   w.carbsG,
        fatG:     w.fatG,
        fiberG:   w.fiberG,
        hasData:  w.hasData,
      }));
    }
    // 1-week: dailyQuery returns 7 objects ordered by dayOfWeek (0=Mon).
    return (dailyQuery.data ?? []).map((d) => ({
      label:    DAY_ABBR[d.dayOfWeek] ?? String(d.dayOfWeek),
      calories: d.calories,
      proteinG: d.proteinG,
      carbsG:   d.carbsG,
      fatG:     d.fatG,
      fiberG:   d.fiberG,
      hasData:  d.hasData,
    }));
  }, [granularity, historyQuery.data, dailyQuery.data]);

  // Dynamic Y-axis ceiling based on visible (non-isolated) series.
  const yMax = useMemo(() => {
    const activeKeys = isolated ? [isolated] : MACROS.map((m) => m.key);
    const allValues = chartData.flatMap((d) =>
      activeKeys.map((k) => (d[k as keyof typeof d] as number) ?? 0),
    );
    return niceMax(Math.max(0, ...allValues));
  }, [chartData, isolated]);

  const isLoading =
    granularity === '2month' ? historyQuery.isLoading : dailyQuery.isLoading;
  const isError =
    granularity === '2month' ? historyQuery.isError : dailyQuery.isError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleLegendClick(payload: any): void {
    const key = String(payload?.dataKey ?? '') as MacroKey;
    if (!key) return;
    setIsolated((prev) => (prev === key ? null : key));
  }

  // Tooltip formatter: append the correct unit.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function tooltipFormatter(value: any, name: any): [string, string] {
    const macro = MACROS.find((m) => m.key === String(name));
    return [`${value as number} ${macro?.unit ?? ''}`, macro?.label ?? String(name)];
  }

  return (
    <section aria-labelledby="trends-heading" className="nutrition-trends">
      <h1 id="trends-heading">Nutrition Trends</h1>

      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="nutrition-trends__controls">
        <div className="nutrition-trends__granularity" role="group" aria-label="Time range">
          <button
            type="button"
            className={`nutrition-trends__gran-btn${granularity === '2month' ? ' nutrition-trends__gran-btn--active' : ''}`}
            onClick={() => setGranularity('2month')}
          >
            2 Months
          </button>
          <button
            type="button"
            className={`nutrition-trends__gran-btn${granularity === '1week' ? ' nutrition-trends__gran-btn--active' : ''}`}
            onClick={() => setGranularity('1week')}
          >
            1 Week
          </button>
        </div>

        <div className="nutrition-trends__nav" aria-label="Navigate period">
          <button
            type="button"
            className="week-nav__arrow"
            aria-label="Previous period"
            onClick={() => setWeekStart((w) => shiftWeek(w, 'prev'))}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
              <polyline points="9,3 5,7 9,11" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="nutrition-trends__period-label">
            {granularity === '1week'
              ? weekLabel(weekStart)
              : `${weekLabel(
                  (() => {
                    const d = new Date(`${weekStart}T00:00:00.000Z`);
                    d.setUTCDate(d.getUTCDate() - 7 * 7);
                    return d.toISOString().slice(0, 10);
                  })(),
                )} – ${weekLabel(weekStart)}`}
          </span>
          <button
            type="button"
            className="week-nav__arrow"
            aria-label="Next period"
            onClick={() => setWeekStart((w) => shiftWeek(w, 'next'))}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
              <polyline points="5,3 9,7 5,11" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {isolated ? (
        <p className="nutrition-trends__filter-note">
          Showing {MACROS.find((m) => m.key === isolated)?.label ?? isolated} only.{' '}
          <button
            type="button"
            className="nutrition-trends__filter-clear"
            onClick={() => setIsolated(null)}
          >
            Show all
          </button>
        </p>
      ) : (
        <p className="nutrition-trends__filter-note">
          Click a nutrient in the legend to isolate it.
        </p>
      )}

      {/* ── Chart ────────────────────────────────────────────── */}
      {isLoading ? (
        <p role="status" className="nutrition-trends__loading">Loading nutrition data...</p>
      ) : isError ? (
        <p role="alert">Could not load nutrition data.</p>
      ) : chartData.length === 0 || chartData.every((d) => !d.hasData) ? (
        <p className="nutrition-trends__empty">No meals planned in this period.</p>
      ) : (
        <div className="nutrition-trends__chart-wrap">
          <ResponsiveContainer width="100%" height={360}>
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 24, left: 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e5e5e5)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, yMax]}
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) => String(v)}
              />
              <Tooltip formatter={tooltipFormatter} />
              <Legend
                onClick={handleLegendClick}
                wrapperStyle={{ cursor: 'pointer', paddingTop: '12px' }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: string, _name: any, entry: any) => (
                  <span
                    style={{
                      opacity: isolated && isolated !== String(entry?.dataKey ?? '') ? 0.35 : 1,
                      fontWeight: isolated === String(entry?.dataKey ?? '') ? 600 : 400,
                    }}
                  >
                    {value}
                  </span>
                )}
              />
              {MACROS.map(({ key, label, color }) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={label}
                  stroke={color}
                  strokeWidth={isolated === key ? 2.5 : 1.8}
                  dot={{ r: 3, fill: color }}
                  activeDot={{ r: 5 }}
                  hide={isolated !== null && isolated !== key}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
