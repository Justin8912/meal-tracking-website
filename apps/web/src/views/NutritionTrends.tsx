import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { shiftWeek, useNutritionHistory, useDailyNutrition } from '../query/plans.js';

/**
 * NutritionTrends — macro intake over time as a Recharts line chart.
 *
 * Granularities:
 *   - 2 months (default): 8 weekly data points, each = per-day average for that week
 *   - 1 week: 7 daily data points from the existing daily-summary endpoint
 *
 * Each macro has a toggle chip. Clicking hides/shows it independently —
 * any combination can be visible at once (at least one is always shown).
 * Y-axis domain adjusts to visible series only with 15% headroom.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

type MacroKey = 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG';

const MACROS: { key: MacroKey; label: string; color: string; unit: string }[] = [
  { key: 'calories', label: 'Calories', color: '#c8902a', unit: 'kcal' },
  { key: 'proteinG', label: 'Protein',  color: '#c0622a', unit: 'g'    },
  { key: 'carbsG',   label: 'Carbs',    color: '#4a90d9', unit: 'g'    },
  { key: 'fatG',     label: 'Fat',      color: '#8a6cb5', unit: 'g'    },
  { key: 'fiberG',   label: 'Fiber',    color: '#4a9e5c', unit: 'g'    },
];

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sundayOf(from: Date): string {
  const d = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

function niceMax(maxValue: number): number {
  if (maxValue <= 0) return 100;
  const withHeadroom = maxValue * 1.15;
  const step =
    maxValue <= 50  ? 10  :
    maxValue <= 200 ? 25  :
    maxValue <= 500 ? 50  : 100;
  return Math.ceil(withHeadroom / step) * step;
}

function weekLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

type Granularity = '2month' | '1week';

export function NutritionTrends(): JSX.Element {
  const [weekStart, setWeekStart] = useState(() => sundayOf(new Date()));
  const [granularity, setGranularity] = useState<Granularity>('2month');
  // hidden = set of macro keys turned OFF. Empty set = all visible.
  const [hidden, setHidden] = useState<Set<MacroKey>>(new Set());

  const historyQuery = useNutritionHistory(weekStart, 8);
  const dailyQuery   = useDailyNutrition(weekStart);

  function toggleMacro(key: MacroKey): void {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        // Keep at least one visible at all times.
        if (next.size < MACROS.length - 1) next.add(key);
      }
      return next;
    });
  }

  const chartData = useMemo(() => {
    if (granularity === '2month') {
      return (historyQuery.data ?? []).map((w) => ({
        label:    weekLabel(w.weekStartDate),
        calories: w.calories,
        proteinG: w.proteinG,
        carbsG:   w.carbsG,
        fatG:     w.fatG,
        fiberG:   w.fiberG,
        hasData:  w.hasData,
      }));
    }
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

  const yMax = useMemo(() => {
    const visibleKeys = MACROS.filter((m) => !hidden.has(m.key)).map((m) => m.key);
    const allValues = chartData.flatMap((d) =>
      visibleKeys.map((k) => (d[k as keyof typeof d] as number) ?? 0),
    );
    return niceMax(Math.max(0, ...allValues));
  }, [chartData, hidden]);

  const periodLabel = useMemo(() => {
    if (granularity === '1week') {
      const end = new Date(`${weekStart}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 6);
      return `${weekLabel(weekStart)} – ${weekLabel(end.toISOString().slice(0, 10))}`;
    }
    const end = new Date(`${weekStart}T00:00:00.000Z`);
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - 7 * 7);
    return `${weekLabel(start.toISOString().slice(0, 10))} – ${weekLabel(weekStart)}`;
  }, [weekStart, granularity]);

  const isLoading =
    granularity === '2month' ? historyQuery.isLoading : dailyQuery.isLoading;
  const isError =
    granularity === '2month' ? historyQuery.isError : dailyQuery.isError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function tooltipFormatter(value: any, name: any): [string, string] {
    const macro = MACROS.find((m) => m.key === String(name));
    return [`${value as number} ${macro?.unit ?? ''}`, macro?.label ?? String(name)];
  }

  return (
    <section aria-labelledby="trends-heading" className="meal-library">
      <h1 id="trends-heading">Nutrition Trends</h1>

      {/* ── Toolbar: granularity pills + period navigation ──────── */}
      <div className="meal-library__toolbar">
        <div className="meal-library__pills">
          <div className="meal-library__pill-row">
            <button
              type="button"
              className={`pill${granularity === '2month' ? ' pill--active' : ''}`}
              onClick={() => setGranularity('2month')}
            >
              2 months
            </button>
            <button
              type="button"
              className={`pill${granularity === '1week' ? ' pill--active' : ''}`}
              onClick={() => setGranularity('1week')}
            >
              1 week
            </button>
          </div>
        </div>

        <div className="meal-library__toolbar-right">
          <div className="week-nav" style={{ padding: '8px 14px' }}>
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
            <div className="week-nav__center">
              <span className="week-nav__range">{periodLabel}</span>
            </div>
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
      </div>

      {/* ── Macro toggle chips ──────────────────────────────────── */}
      <div className="trends__legend" role="group" aria-label="Toggle nutrients">
        {MACROS.map(({ key, label, color }) => {
          const isVisible = !hidden.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleMacro(key)}
              aria-pressed={isVisible}
              className="trends__legend-chip"
              style={{
                '--macro-color': color,
                opacity: isVisible ? 1 : 0.3,
              } as React.CSSProperties}
            >
              <span className="trends__legend-dot" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Chart ──────────────────────────────────────────────── */}
      {isLoading ? (
        <p role="status" style={{ color: 'var(--muted)', fontStyle: 'italic', padding: '40px 0' }}>
          Loading nutrition data...
        </p>
      ) : isError ? (
        <p role="alert">Could not load nutrition data.</p>
      ) : chartData.length === 0 || chartData.every((d) => !d.hasData) ? (
        <p style={{ color: 'var(--muted)', fontStyle: 'italic', padding: '40px 0' }}>
          No meals planned in this period.
        </p>
      ) : (
        <div style={{ marginTop: '8px' }}>
          <ResponsiveContainer width="100%" height={360}>
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light, #e8e3da)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: 'var(--muted, #9e9689)' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, yMax]}
                tick={{ fontSize: 12, fill: 'var(--muted, #9e9689)' }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                formatter={tooltipFormatter}
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid var(--border, #e0d9ce)',
                  background: 'var(--card, #fff)',
                  fontSize: '13px',
                  fontFamily: 'var(--font-body)',
                }}
              />
              {MACROS.map(({ key, color }) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  strokeWidth={1.8}
                  dot={{ r: 3, fill: color, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  hide={hidden.has(key)}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <style>{`
        .trends__legend {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 4px 0 16px;
        }
        .trends__legend-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 14px 5px 10px;
          border-radius: 24px;
          border: 1.5px solid var(--macro-color);
          background: transparent;
          font-size: 12px;
          font-weight: 500;
          color: var(--macro-color);
          cursor: pointer;
          transition: opacity 0.15s;
          font-family: var(--font-body, inherit);
        }
        .trends__legend-chip:hover { opacity: 0.65 !important; }
        .trends__legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--macro-color);
          flex-shrink: 0;
        }
      `}</style>
    </section>
  );
}
