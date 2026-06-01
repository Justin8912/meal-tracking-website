import { useState, type FormEvent } from 'react';
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

/** The four meal slots a planned meal can occupy (AD-1). */
const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

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
            return (
              <li key={entry.id}>
                <span>{entryLabel(entry)}</span>
                <span> ({entry.mealSlot})</span>
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

export function WeeklyPlanner(): JSX.Element {
  // The active week's Monday DATE is the ONLY navigation state (AD-2). It starts
  // at the current week and shifts by +/- 7 days via shiftWeek for back/forward
  // navigation; the displayed week is derived entirely from the week-keyed
  // server query below, so no plan data lives in component state (AC-3.3).
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const {
    data: entries,
    isLoading,
    isError,
    error,
    refetch,
  } = useWeekPlan(weekStart);

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

      {/* Navigation shifts the active Monday by +/- 7 days (date arithmetic,
          year-boundary safe per F-11/S-4); each week is a distinct
          ['plan', weekStart] cache entry, so a revisited week renders instantly
          from cache (AD-4). */}
      <nav aria-label="Week navigation">
        <button
          type="button"
          onClick={() => setWeekStart((w) => shiftWeek(w, 'prev'))}
        >
          Previous week
        </button>
        <p>Week of {weekStart}</p>
        <button
          type="button"
          onClick={() => setWeekStart((w) => shiftWeek(w, 'next'))}
        >
          Next week
        </button>
      </nav>

      {isLoading ? (
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
        <ol aria-label="Days of the week" className="weekly-planner__week">
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
      )}
    </section>
  );
}
