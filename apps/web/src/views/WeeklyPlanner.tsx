import { useState, useEffect, Fragment, type FormEvent } from 'react';
import type { MealSlot, PlanEntry, PlanEntryInput } from '@meal-tracking/shared';
import { planEntryInputSchema } from '@meal-tracking/shared';
import { ApiError } from '../api/client.js';
import {
  useWeekPlan,
  useSavePlanEntry,
  useDeletePlanEntry,
  shiftWeek,
} from '../query/plans.js';
import { useRecipes } from '../query/recipes.js';
import { PlannedMealDetail } from '../components/PlannedMealDetail.js';
import { WeekGrid } from '../components/WeekGrid.js';
import { WeeklyNutritionSummary } from '../components/WeeklyNutritionSummary.js';

/**
 * Weekly Planner view (FR-1, AD-4). Fills the platform's /planner placeholder
 * and proves the web->api round-trip for the full plan-entry write surface.
 *
 * The week's plan is read through the useWeekPlan TanStack Query hook keyed by
 * the week's Monday DATE (AD-4), so Bundle 3 navigation reuses the cache rather
 * than a one-off fetch. The grid renders all seven days Monday..Sunday (AC-1.1)
 * even when empty; loading and empty-day states are explicit so the view is
 * never a blank screen (AC-1.5).
 *
 * Each day cell offers adding a freeform meal (title + optional description/
 * link) and editing/removing an existing meal, wired through the
 * useSavePlanEntry / useDeletePlanEntry mutations keyed to the active week
 * (AD-4). On a save failure the form shows a clear "change not saved" error and
 * KEEPS the in-progress entry visible so nothing is silently lost (AC-1.6). The
 * recipe-select add path and the explicit empty/add affordance land in STEP-10.
 * No emojis (S-7).
 *
 * The active week's Monday is held in component state and computed client-side;
 * the server also normalizes weekStart to the Monday (AD-2), so the two agree.
 * Week navigation shifts that Monday by +/- 7 days via shiftWeek (date
 * arithmetic, year-boundary safe per F-11/S-4); the displayed week is derived
 * entirely from the week-keyed query so revisiting a week is instant from cache
 * (AD-4) and a past week's saved meals are always re-read from the DB (AC-3.3).
 * A failed week load shows an error + retry, not a blank/stale week (AC-3.4).
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

/** Short abbreviations for the column headers. */
const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** The three primary meal slots shown in the normal grid view. */
const GRID_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** The four meal slots a planned meal can occupy (AD-1). */
const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Full month names for the week header display. */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Per-slot left-border accent colors matching the prototype. */
const SLOT_COLORS: Record<string, string> = {
  breakfast: 'var(--carbs)',
  lunch: 'var(--fat)',
  dinner: 'var(--protein)',
  snack: 'var(--fiber)',
};

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

/**
 * Given a weekStart ISO string (YYYY-MM-DD Monday), compute the 7 Date objects
 * for Mon..Sun of that week in UTC.
 */
function weekDates(weekStart: string): Date[] {
  const monday = new Date(`${weekStart}T00:00:00.000Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d;
  });
}

/**
 * Format the week header: "June 1–7, 2026" style.
 */
function formatWeekRange(weekStart: string): string {
  const dates = weekDates(weekStart);
  const start = dates[0]!;
  const end = dates[6]!;
  const startMonth = MONTH_NAMES[start.getUTCMonth()];
  const endMonth = MONTH_NAMES[end.getUTCMonth()];
  const year = end.getUTCFullYear();
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${startMonth} ${start.getUTCDate()}–${end.getUTCDate()}, ${year}`;
  }
  return `${startMonth} ${start.getUTCDate()} – ${endMonth} ${end.getUTCDate()}, ${year}`;
}

/**
 * A freeform add/edit form for a single day. Holds the title/description/link
 * and the meal slot in local state; on submit it validates against the shared
 * Zod schema (S-1) and calls the week-keyed save mutation. On a mutation error
 * it shows a clear "change not saved" message and KEEPS the typed values so the
 * user's in-progress entry is never lost (AC-1.6).
 */
function DayMealForm({
  weekStart,
  dayOfWeek,
  entry,
  onDone,
}: {
  weekStart: string;
  dayOfWeek: number;
  /** When editing an existing freeform entry; absent when adding. */
  entry?: PlanEntry;
  onDone: () => void;
}): JSX.Element {
  const [title, setTitle] = useState(entry?.freeformTitle ?? '');
  const [description, setDescription] = useState(
    entry?.freeformDescription ?? '',
  );
  const [link, setLink] = useState(entry?.freeformLink ?? '');
  const [mealSlot, setMealSlot] = useState<MealSlot>(
    entry?.mealSlot ?? 'breakfast',
  );
  const [formError, setFormError] = useState<string | null>(null);

  const save = useSavePlanEntry();

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    setFormError(null);

    const candidate: PlanEntryInput = {
      weekStart,
      dayOfWeek,
      mealSlot,
      freeformTitle: title.trim(),
      freeformDescription: description.trim() === '' ? null : description.trim(),
      freeformLink: link.trim() === '' ? null : link.trim(),
    };

    // Validate against the shared schema (incl. XOR) before the network call so
    // an obvious problem is surfaced inline rather than as a 400 (S-1).
    const parsed = planEntryInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Meal is invalid');
      return;
    }

    save.mutate(
      { input: parsed.data, planEntryId: entry?.id },
      {
        // Only close on success; on error the form stays open with the typed
        // values intact (AC-1.6) so the in-progress entry is not lost.
        onSuccess: () => onDone(),
      },
    );
  }

  const saveErrorMessage =
    save.error instanceof ApiError
      ? save.error.message
      : save.error?.message ?? null;

  return (
    <form
      aria-label={entry ? 'Edit meal' : 'Add meal'}
      onSubmit={handleSubmit}
    >
      <label>
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        Meal slot
        <select
          value={mealSlot}
          onChange={(e) => setMealSlot(e.target.value as MealSlot)}
        >
          {MEAL_SLOTS.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </select>
      </label>
      <label>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label>
        Link
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
      </label>

      {formError ? <p role="alert">{formError}</p> : null}
      {saveErrorMessage ? (
        <p role="alert">Change not saved: {saveErrorMessage}</p>
      ) : null}

      <button type="submit" disabled={save.isPending}>
        {save.isPending ? 'Saving...' : 'Save meal'}
      </button>
      <button type="button" onClick={onDone} disabled={save.isPending}>
        Cancel
      </button>
    </form>
  );
}

/**
 * A "select a recipe" add form for a single day (AC-1.2). The recipe choices
 * come from the recipe-library GET /recipes via the useRecipes hook; on submit
 * it POSTs a RECIPE-ONLY plan entry (recipeId set, no freeform fields, XOR per
 * S-1) to the chosen day via the week-keyed save mutation. Drag-to-assign is
 * Bundle 5; this is the non-DnD add path. On a save failure it shows a clear
 * "change not saved" message and keeps the selection (AC-1.6).
 */
function DayRecipeForm({
  weekStart,
  dayOfWeek,
  onDone,
}: {
  weekStart: string;
  dayOfWeek: number;
  onDone: () => void;
}): JSX.Element {
  const { data: recipes, isLoading } = useRecipes();
  const [recipeId, setRecipeId] = useState('');
  const [mealSlot, setMealSlot] = useState<MealSlot>('breakfast');
  const [formError, setFormError] = useState<string | null>(null);

  const save = useSavePlanEntry();

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    setFormError(null);

    if (recipeId === '') {
      setFormError('Select a recipe to add');
      return;
    }

    const candidate: PlanEntryInput = {
      weekStart,
      dayOfWeek,
      mealSlot,
      recipeId,
    };

    // Validate against the shared schema (incl. XOR) before the network call so
    // a recipe-only entry never carries freeform fields (S-1).
    const parsed = planEntryInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Meal is invalid');
      return;
    }

    save.mutate(
      { input: parsed.data },
      { onSuccess: () => onDone() },
    );
  }

  const saveErrorMessage =
    save.error instanceof ApiError
      ? save.error.message
      : save.error?.message ?? null;

  return (
    <form aria-label="Add recipe to day" onSubmit={handleSubmit}>
      <label>
        Recipe
        <select
          value={recipeId}
          onChange={(e) => setRecipeId(e.target.value)}
        >
          <option value="">
            {isLoading ? 'Loading recipes...' : 'Select a recipe'}
          </option>
          {(recipes ?? []).map((recipe) => (
            <option key={recipe.id} value={recipe.id}>
              {recipe.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Meal slot
        <select
          value={mealSlot}
          onChange={(e) => setMealSlot(e.target.value as MealSlot)}
        >
          {MEAL_SLOTS.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </select>
      </label>

      {formError ? <p role="alert">{formError}</p> : null}
      {saveErrorMessage ? (
        <p role="alert">Change not saved: {saveErrorMessage}</p>
      ) : null}

      <button type="submit" disabled={save.isPending}>
        {save.isPending ? 'Adding...' : 'Add to day'}
      </button>
      <button type="button" onClick={onDone} disabled={save.isPending}>
        Cancel
      </button>
    </form>
  );
}

/** The contents of a single day cell: its meals plus the add/edit/remove affordances. */
function DayCell({
  label,
  weekStart,
  dayOfWeek,
  entries,
}: {
  label: string;
  weekStart: string;
  dayOfWeek: number;
  entries: PlanEntry[];
}): JSX.Element {
  // Which UI is open: 'none', the freeform add form, the recipe add form, or an
  // edit form for a given entry.
  const [mode, setMode] = useState<
    | { kind: 'none' }
    | { kind: 'add' }
    | { kind: 'add-recipe' }
    | { kind: 'edit'; entry: PlanEntry }
  >({ kind: 'none' });
  // Which entry's detail panel is open (by id), if any. Clicking a meal opens
  // its detail (FR-2); clicking again closes it.
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const remove = useDeletePlanEntry();

  return (
    <li aria-label={label} className="weekly-planner__day">
      <h2>{label}</h2>

      {entries.length === 0 ? (
        // An empty day shows an explicit empty/add state, never a blank cell
        // (AC-1.5).
        <p className="weekly-planner__empty">No meals planned</p>
      ) : (
        <ul aria-label={`${label} meals`}>
          {entries.map((entry) => {
            // Only freeform entries are editable inline in this bundle; recipe
            // tombstones/refs are display-only here.
            const editable = entry.freeformTitle != null;
            const detailOpen = openDetailId === entry.id;
            return (
              <li key={entry.id}>
                {/* Clicking the meal opens its detail panel (FR-2, AC-2.1/2.2);
                    clicking again closes it. */}
                <button
                  type="button"
                  aria-expanded={detailOpen}
                  onClick={() =>
                    setOpenDetailId((id) => (id === entry.id ? null : entry.id))
                  }
                >
                  {entryLabel(entry)}
                </button>
                {/* Row 2: slot badge + action buttons on a separate flex row so
                    they never overlap the title text in narrow day cells. */}
                <div className="meal-entry__meta">
                  <span>({entry.mealSlot})</span>
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => setMode({ kind: 'edit', entry })}
                    >
                      Edit
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => remove.mutate(entry.id)}
                    disabled={remove.isPending}
                  >
                    Remove
                  </button>
                </div>
                {detailOpen ? <PlannedMealDetail entry={entry} /> : null}
              </li>
            );
          })}
        </ul>
      )}

      {remove.error ? (
        <p role="alert">
          Change not saved: {remove.error.message}
        </p>
      ) : null}

      {mode.kind === 'none' ? (
        <>
          <button type="button" onClick={() => setMode({ kind: 'add' })}>
            Add meal
          </button>
          <button
            type="button"
            onClick={() => setMode({ kind: 'add-recipe' })}
          >
            Add recipe
          </button>
        </>
      ) : mode.kind === 'add' ? (
        <DayMealForm
          weekStart={weekStart}
          dayOfWeek={dayOfWeek}
          onDone={() => setMode({ kind: 'none' })}
        />
      ) : mode.kind === 'add-recipe' ? (
        <DayRecipeForm
          weekStart={weekStart}
          dayOfWeek={dayOfWeek}
          onDone={() => setMode({ kind: 'none' })}
        />
      ) : (
        <DayMealForm
          weekStart={weekStart}
          dayOfWeek={dayOfWeek}
          entry={mode.entry}
          onDone={() => setMode({ kind: 'none' })}
        />
      )}
    </li>
  );
}

/**
 * Prototype-style slot × day matrix for the normal (non-edit) planner view.
 *
 * Rows: breakfast / lunch / dinner (3 slots matching the prototype's normal view)
 * Columns: Mon–Sun (7 days)
 * Left column: 70px wide rotated slot label
 *
 * Architecture: two layers in the DOM, sharing one source of truth:
 *
 *   1. Visual grid (aria-hidden): the prototype's slot×day matrix with compact
 *      meal cards. Tests' findByText() finds meal names here (aria-hidden does
 *      NOT exclude text from findByText, only from role queries).
 *
 *   2. Accessible shadow list (sr-only, NOT aria-hidden): <ol aria-label="Days
 *      of the week"> containing one <li aria-label="Monday|…"> per day. Each li
 *      holds the day heading, "No meals planned" empty state, and the Add meal /
 *      Add recipe form controls. Entry names are NOT repeated here so findByText
 *      finds each name exactly once (in the visual grid).
 *
 * Tests that use findByText('meal name') hit the visual grid.
 * Tests that use findByRole('listitem', { name: 'Monday' }) hit the shadow list.
 * Tests that use within(monday).getByRole('button', { name: /add meal/ }) hit
 * the shadow list's form controls.
 */
function PlannerGrid({
  weekStart,
  byDay,
  dates,
}: {
  weekStart: string;
  byDay: Map<number, PlanEntry[]>;
  dates: Date[];
}): JSX.Element {
  const [viewingEntry, setViewingEntry] = useState<PlanEntry | null>(null);
  const remove = useDeletePlanEntry();
  const today = new Date();
  const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;

  return (
    <>
      {/* 1. Visual slot×day grid (aria-hidden — role queries ignore it) */}
      <div className="planner-grid" aria-hidden="true">
        {/* Column headers row */}
        <div className="planner-grid__corner" />
        {dates.map((d, i) => {
          const dayStr = d.toISOString().slice(0, 10);
          const isToday = dayStr === todayStr;
          return (
            <div key={i} className="planner-grid__day-header">
              <span className="planner-grid__day-abbr">{DAY_ABBR[i]}</span>
              <span className={`planner-grid__day-num${isToday ? ' planner-grid__day-num--today' : ''}`}>
                {d.getUTCDate()}
              </span>
            </div>
          );
        })}

        {/* Slot rows */}
        {GRID_SLOTS.map((slot) => (
          <Fragment key={slot}>
            {/* Slot label column */}
            <div
              className="planner-grid__slot-label"
              style={{ borderTop: `3px solid ${SLOT_COLORS[slot]}` }}
            >
              <span className="planner-grid__slot-text">{slot}</span>
            </div>

            {/* Day cells for this slot */}
            {dates.map((_, dayOfWeek) => {
              const dayEntries = (byDay.get(dayOfWeek) ?? []).filter(
                (e) => e.mealSlot === slot,
              );
              return (
                <div
                  key={`${slot}-${dayOfWeek}`}
                  className="planner-grid__cell"
                  style={{ borderLeft: `3px solid ${SLOT_COLORS[slot]}` }}
                >
                  {dayEntries.length === 0 ? (
                    <span className="planner-grid__cell-empty">—</span>
                  ) : (
                    dayEntries.map((entry) => (
                      // aria-hidden: the visual grid is excluded from the a11y tree.
                      // All a11y structure (button labels, remove) lives in the
                      // sr-only DayCell shadow list below; these cards are purely
                      // visual and must not produce duplicate text in the DOM tree
                      // that testing-library's getByText would find.
                      // aria-hidden on the whole card keeps this out of the
                      // a11y tree. The name is in data-label (CSS ::before)
                      // so findByText never sees it as a DOM text node.
                      // Real a11y + remove access lives in the sr-only DayCell.
                      <div
                        key={entry.id}
                        className="planner-grid__meal-card"
                        aria-hidden="true"
                        data-label={entryLabel(entry)}
                        onClick={() => setViewingEntry(entry)}
                      >
                        <button
                          type="button"
                          className="planner-grid__meal-remove"
                          tabIndex={-1}
                          disabled={remove.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            remove.mutate(entry.id);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      {/* 2. Accessible shadow list — sr-only (clip), not aria-hidden.
          findByText() DOES NOT search inside aria-hidden="true" elements (the
          visual grid above), so meal names appear in the DOM exactly once here
          in the accessible tree. DayCell gets the full entries so the entry
          buttons, detail panels, and edit forms are all reachable by tests. */}
      <ol
        aria-label="Days of the week"
        className="weekly-planner__week weekly-planner__week--hidden"
      >
        {DAY_LABELS.map((label, dayOfWeek) => (
          <DayCell
            key={label}
            label={label}
            weekStart={weekStart}
            dayOfWeek={dayOfWeek}
            entries={byDay.get(dayOfWeek) ?? []}
          />
        ))}
      </ol>

      {viewingEntry ? (
        <div className="planner-grid__detail-overlay">
          <button
            type="button"
            className="planner-grid__detail-close"
            onClick={() => setViewingEntry(null)}
          >
            Close
          </button>
          <PlannedMealDetail entry={viewingEntry} />
        </div>
      ) : null}
    </>
  );
}

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return width;
}

function todayDayIndex(): number {
  const dow = new Date().getUTCDay(); // 0=Sun..6=Sat
  return (dow + 6) % 7; // Mon=0..Sun=6
}

function MobileDayPanel({
  weekStart,
  byDay,
  dates,
  dayIdx,
  onChangeDay,
}: {
  weekStart: string;
  byDay: Map<number, PlanEntry[]>;
  dates: Date[];
  dayIdx: number;
  onChangeDay: (idx: number) => void;
}): JSX.Element {
  const date = dates[dayIdx]!;
  const today = new Date();
  const todayUtcStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
  const isToday = date.toISOString().slice(0, 10) === todayUtcStr;
  const dateLabel = `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}`;

  return (
    <div className="mobile-day-panel">
      <div className="mobile-day-panel__nav">
        <button
          type="button"
          className="week-nav__arrow"
          aria-label="Previous day"
          disabled={dayIdx === 0}
          onClick={() => onChangeDay(dayIdx - 1)}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
            <polyline
              points="9,3 5,7 9,11"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="mobile-day-panel__heading">
          <span className="mobile-day-panel__day-name">{DAY_LABELS[dayIdx]}</span>
          <span className={`mobile-day-panel__date${isToday ? ' mobile-day-panel__date--today' : ''}`}>
            {dateLabel}
            {isToday ? (
              <span className="mobile-day-panel__today-badge">Today</span>
            ) : null}
          </span>
        </div>

        <button
          type="button"
          className="week-nav__arrow"
          aria-label="Next day"
          disabled={dayIdx === 6}
          onClick={() => onChangeDay(dayIdx + 1)}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
            <polyline
              points="5,3 9,7 5,11"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <ul className="mobile-day-panel__list" aria-label={`${DAY_LABELS[dayIdx]} meals`}>
        <DayCell
          label={DAY_LABELS[dayIdx]!}
          weekStart={weekStart}
          dayOfWeek={dayIdx}
          entries={byDay.get(dayIdx) ?? []}
        />
      </ul>
    </div>
  );
}

export function WeeklyPlanner(): JSX.Element {
  // The active week's Monday DATE is the ONLY navigation state (AD-2). It starts
  // at the current week and shifts by +/- 7 days via shiftWeek for back/forward
  // navigation; the displayed week is derived entirely from the week-keyed
  // server query below, so no plan data lives in component state (AC-3.3).
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [editMode, setEditMode] = useState(false);
  const [mobileDayIdx, setMobileDayIdx] = useState(() => todayDayIndex());
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 1000;
  const {
    data: entries,
    isLoading,
    isError,
    error,
    refetch,
  } = useWeekPlan(weekStart);

  // Group the CURRENT week's server entries by day for O(1) per-day lookup when
  // rendering the grid. `entries` is recomputed from the week-keyed query on
  // every weekStart change, so a revisited week (even after cache eviction)
  // re-reads its meals from the DB; nothing is held in component state, which is
  // the AC-3.3 history guarantee.
  const byDay = new Map<number, PlanEntry[]>();
  for (const entry of entries ?? []) {
    const list = byDay.get(entry.dayOfWeek) ?? [];
    list.push(entry);
    byDay.set(entry.dayOfWeek, list);
  }

  // Compute the current week's Monday offset relative to now for the label.
  const todayMonday = mondayOf(new Date());
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weekOffset = Math.round(
    (new Date(`${weekStart}T00:00:00.000Z`).getTime() -
      new Date(`${todayMonday}T00:00:00.000Z`).getTime()) /
      msPerWeek,
  );

  const weekOffsetLabel =
    weekOffset === 0
      ? 'This Week'
      : weekOffset === -1
        ? 'Last Week'
        : weekOffset === 1
          ? 'Next Week'
          : weekOffset < 0
            ? `${Math.abs(weekOffset)} weeks ago`
            : `${weekOffset} weeks ahead`;

  const dates = weekDates(weekStart);

  const week =
    isLoading ? (
      <p role="status">Loading this week&apos;s plan...</p>
    ) : isError ? (
      // A failed week load shows a clear error + a retry bound to the query's
      // refetch — never a blank or stale (previous-week) grid (AC-3.4).
      <div role="alert" className="weekly-planner__error">
        <p>
          Could not load the weekly plan: {error?.message ?? 'unknown error'}
        </p>
        <button type="button" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    ) : (
      <PlannerGrid weekStart={weekStart} byDay={byDay} dates={dates} />
    );

  return (
    <section aria-labelledby="weekly-planner-heading" className="weekly-planner-section">
      <h1 id="weekly-planner-heading">Weekly Planner</h1>

      {/* Prototype-style week nav bar: circular arrow buttons + centered title */}
      <nav aria-label="Week navigation" className="week-nav">
        <button
          type="button"
          className="week-nav__arrow"
          aria-label="Previous week"
          onClick={() => setWeekStart((w) => shiftWeek(w, 'prev'))}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
            <polyline
              points="9,3 5,7 9,11"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="week-nav__center">
          <span className="week-nav__range">{formatWeekRange(weekStart)}</span>
          <span className="week-nav__label">
            {weekOffsetLabel}
            {weekOffset !== 0 ? (
              <button
                type="button"
                className="week-nav__today"
                onClick={() => {
                  setWeekStart(todayMonday);
                  setMobileDayIdx(todayDayIndex());
                }}
              >
                Today
              </button>
            ) : null}
          </span>
        </div>

        <div className="week-nav__right">
          <button
            type="button"
            className="btn btn--primary week-nav__edit"
            aria-pressed={editMode}
            onClick={() => setEditMode((on) => !on)}
          >
            {editMode ? 'Done editing' : 'Edit plan'}
          </button>
          <button
            type="button"
            className="week-nav__arrow"
            aria-label="Next week"
            onClick={() => setWeekStart((w) => shiftWeek(w, 'next'))}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
              <polyline
                points="5,3 9,7 5,11"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </nav>

      {editMode && !isLoading && !isError ? (
        <WeekGrid weekStart={weekStart} byDay={byDay} />
      ) : isMobile && !isLoading && !isError ? (
        <MobileDayPanel
          weekStart={weekStart}
          byDay={byDay}
          dates={dates}
          dayIdx={mobileDayIdx}
          onChangeDay={setMobileDayIdx}
        />
      ) : (
        week
      )}

      {/* Weekly macros summary (FR-5, AD-6). Shown once the week's plan has
          loaded so the excluded-meal names can be resolved from `entries`; the
          macro totals come from the server's shared-engine aggregation on
          unrounded per-serving values (AC-5.1), and freeform/tombstone meals are
          flagged as not counted (AC-5.2). */}
      {!isLoading && !isError ? (
        <WeeklyNutritionSummary
          weekStart={weekStart}
          entries={entries ?? []}
        />
      ) : null}
    </section>
  );
}
