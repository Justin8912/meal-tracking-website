import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  within,
  cleanup,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { PlanEntry, WeeklySummary } from '@meal-tracking/shared';
import { WeeklyNutritionSummary } from './WeeklyNutritionSummary.js';

/**
 * STEP-21 (test-first for STEP-22, web side): the weekly nutrition summary UI
 * (FR-5, AC-5.1/AC-5.2; AD-6).
 *
 * The component reads GET /plans/summary via useWeeklySummary and renders the
 * five MACRO totals (calories/protein/carbs/fat/fiber) - macros only, no
 * vitamins/minerals (AC-5.1). It must clearly state which of the week's meals
 * are NOT counted (freeform + recipe tombstones) by name, mapping the summary's
 * excludedEntryIds to the week's plan entries, never silently dropping them
 * (AC-5.2). It also handles loading/error states so it is never a blank panel.
 *
 * Macros come straight from the server (which sums UNROUNDED per-serving values
 * via the shared engine and rounds once, F-20); the component renders them
 * as-is and never re-rounds. Fails before STEP-22 (the component does not exist).
 */
function renderWithClient(ui: ReactElement): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window._env_;
});

const WEEK = '2026-06-08';
const RECIPE_ENTRY_ID = '11111111-1111-1111-1111-111111111111';
const FREEFORM_ENTRY_ID = '22222222-2222-2222-2222-222222222222';
const TOMBSTONE_ENTRY_ID = '33333333-3333-3333-3333-333333333333';

/** The week's plan entries: one recipe-backed, one freeform, one tombstone. */
function weekEntries(): PlanEntry[] {
  return [
    {
      id: RECIPE_ENTRY_ID,
      weekStartDate: WEEK,
      dayOfWeek: 0,
      mealSlot: 'breakfast',
      position: 0,
      recipeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      recipeName: 'Oatmeal Bowl',
      freeformTitle: null,
      freeformDescription: null,
      freeformLink: null,
    },
    {
      id: FREEFORM_ENTRY_ID,
      weekStartDate: WEEK,
      dayOfWeek: 1,
      mealSlot: 'lunch',
      position: 0,
      recipeId: null,
      freeformTitle: 'Leftover Pizza',
      freeformDescription: null,
      freeformLink: null,
    },
    {
      // Tombstone: recipe deleted (recipe_id NULL, no freeform fields).
      id: TOMBSTONE_ENTRY_ID,
      weekStartDate: WEEK,
      dayOfWeek: 2,
      mealSlot: 'dinner',
      position: 0,
      recipeId: null,
      freeformTitle: null,
      freeformDescription: null,
      freeformLink: null,
    },
  ];
}

/** The summary the API returns: macros only + counted/excluded ids. */
const SUMMARY: WeeklySummary = {
  weekStartDate: WEEK,
  totals: { calories: 696, proteinG: 49.4, carbsG: 101.9, fatG: 11.6, fiberG: 15.9 },
  countedEntryIds: [RECIPE_ENTRY_ID],
  excludedEntryIds: [FREEFORM_ENTRY_ID, TOMBSTONE_ENTRY_ID],
};

/** Mock fetch: route GET /plans/summary to the SUMMARY fixture. */
function mockSummary(summary: WeeklySummary = SUMMARY): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url.includes('/plans/summary')) {
      return Promise.resolve(
        new Response(JSON.stringify(summary), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
  });
}

describe('WeeklyNutritionSummary', () => {
  it('renders the five macro totals exactly as the server returns them (AC-5.1)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockSummary();
    renderWithClient(
      <WeeklyNutritionSummary weekStart={WEEK} entries={weekEntries()} />,
    );

    const region = await screen.findByRole('region', {
      name: /weekly nutrition summary/i,
    });
    // Wait for the query to resolve (the region renders during loading first).
    expect((await within(region).findByLabelText(/total calories/i)).textContent).toBe(
      '696',
    );
    expect(within(region).getByLabelText(/total protein/i).textContent).toBe(
      '49.4',
    );
    expect(within(region).getByLabelText(/total carbs/i).textContent).toBe(
      '101.9',
    );
    expect(within(region).getByLabelText(/total fat/i).textContent).toBe(
      '11.6',
    );
    expect(within(region).getByLabelText(/total fiber/i).textContent).toBe(
      '15.9',
    );
  });

  it('does not render any vitamin/mineral aggregation (AC-5.1)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockSummary();
    renderWithClient(
      <WeeklyNutritionSummary weekStart={WEEK} entries={weekEntries()} />,
    );

    await screen.findByRole('region', { name: /weekly nutrition summary/i });
    // Wait for the totals to render before asserting micros are absent.
    await screen.findByLabelText(/total calories/i);
    // No micronutrient/%DV terms appear at the weekly level.
    expect(screen.queryByText(/iron/i)).toBeNull();
    expect(screen.queryByText(/vitamin/i)).toBeNull();
    expect(screen.queryByText(/%\s*dv|daily value/i)).toBeNull();
  });

  it('flags the freeform meal and the tombstone as not counted, by name (AC-5.2)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockSummary();
    renderWithClient(
      <WeeklyNutritionSummary weekStart={WEEK} entries={weekEntries()} />,
    );

    await screen.findByRole('region', { name: /weekly nutrition summary/i });
    // There is an explicit "not counted" note (await the query resolving).
    const excluded = await screen.findByRole('note');
    expect(excluded.textContent).toMatch(/not counted/i);
    // The freeform meal is named in the excluded list.
    expect(within(excluded).getByText(/leftover pizza/i)).toBeTruthy();
    // The tombstone is surfaced as a removed recipe, not silently dropped.
    expect(within(excluded).getByText(/recipe removed/i)).toBeTruthy();
    // The counted recipe is NOT in the excluded note.
    expect(within(excluded).queryByText(/oatmeal bowl/i)).toBeNull();
  });

  it('states nothing is excluded when every meal is recipe-based', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockSummary({
      ...SUMMARY,
      countedEntryIds: [RECIPE_ENTRY_ID],
      excludedEntryIds: [],
    });
    renderWithClient(
      <WeeklyNutritionSummary
        weekStart={WEEK}
        entries={[weekEntries()[0]!]}
      />,
    );

    await screen.findByRole('region', { name: /weekly nutrition summary/i });
    // Wait for the totals to render before asserting the note is absent.
    await screen.findByLabelText(/total calories/i);
    // No "not counted" note when nothing is excluded.
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('shows an error state when the summary fails to load, not a blank panel', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: 'INTERNAL', message: 'boom' } }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    renderWithClient(
      <WeeklyNutritionSummary weekStart={WEEK} entries={weekEntries()} />,
    );

    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
