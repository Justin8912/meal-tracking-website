import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { PlanEntry, WeeklySummary } from '@meal-tracking/shared';
import { WeeklyNutritionSummary } from './WeeklyNutritionSummary.js';

function renderWithClient(ui: ReactElement): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); delete window._env_; });

const WEEK = '2026-06-08';
const RECIPE_ENTRY_ID = '11111111-1111-1111-1111-111111111111';
const FREEFORM_ENTRY_ID = '22222222-2222-2222-2222-222222222222';
const TOMBSTONE_ENTRY_ID = '33333333-3333-3333-3333-333333333333';
const EMPTY_DAILY = Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, hasData: false, calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }));

function weekEntries(): PlanEntry[] {
  return [
    { id: RECIPE_ENTRY_ID, weekStartDate: WEEK, dayOfWeek: 0, mealSlot: 'breakfast', position: 0, recipeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', recipeName: 'Oatmeal Bowl', freeformTitle: null, freeformDescription: null, freeformLink: null },
    { id: FREEFORM_ENTRY_ID, weekStartDate: WEEK, dayOfWeek: 1, mealSlot: 'lunch', position: 0, recipeId: null, freeformTitle: 'Leftover Pizza', freeformDescription: null, freeformLink: null },
    { id: TOMBSTONE_ENTRY_ID, weekStartDate: WEEK, dayOfWeek: 2, mealSlot: 'dinner', position: 0, recipeId: null, freeformTitle: null, freeformDescription: null, freeformLink: null },
  ];
}

const SUMMARY: WeeklySummary = {
  weekStartDate: WEEK,
  totals: { calories: 696, proteinG: 49.4, carbsG: 101.9, fatG: 11.6, fiberG: 15.9 },
  countedEntryIds: [RECIPE_ENTRY_ID],
  excludedEntryIds: [FREEFORM_ENTRY_ID, TOMBSTONE_ENTRY_ID],
};

function mockSummaryAndDaily(summary: WeeklySummary = SUMMARY): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url.includes('/plans/daily-summary')) return Promise.resolve(new Response(JSON.stringify(EMPTY_DAILY), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    if (url.includes('/plans/summary')) return Promise.resolve(new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
}

describe('WeeklyNutritionSummary', () => {
  it('renders the section with average pills showing weekly totals (AC-5.1)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockSummaryAndDaily();
    renderWithClient(<WeeklyNutritionSummary weekStart={WEEK} entries={weekEntries()} />);
    expect(await screen.findByRole('region', { name: /weekly nutrition summary/i })).toBeTruthy();
    expect(await screen.findByText(/daily average/i)).toBeTruthy();
    expect(await screen.findByText(/696.*kcal/i)).toBeTruthy();
  });

  it('does not render any vitamin/mineral aggregation (AC-5.1)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockSummaryAndDaily();
    renderWithClient(<WeeklyNutritionSummary weekStart={WEEK} entries={weekEntries()} />);
    await screen.findByText(/daily average/i);
    expect(screen.queryByText(/iron/i)).toBeNull();
    expect(screen.queryByText(/vitamin/i)).toBeNull();
    expect(screen.queryByText(/%\s*dv|daily value/i)).toBeNull();
  });

  it('shows Mon–Sun day tabs', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockSummaryAndDaily();
    renderWithClient(<WeeklyNutritionSummary weekStart={WEEK} entries={weekEntries()} />);
    // Wait for loading to finish (average line appears after both queries resolve)
    await screen.findByText(/daily average/i);
    for (const abbr of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByRole('tab', { name: new RegExp(abbr, 'i') })).toBeTruthy();
    }
  });

  it('Monday tab shows the recipe-backed meal name (AC-5.2)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockSummaryAndDaily();
    renderWithClient(<WeeklyNutritionSummary weekStart={WEEK} entries={weekEntries()} />);
    await screen.findByRole('region', { name: /weekly nutrition summary/i });
    expect(await screen.findByText('Oatmeal Bowl')).toBeTruthy();
  });

  it('Tuesday tab shows freeform meal with no-nutrition badge (AC-5.2)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockSummaryAndDaily();
    renderWithClient(<WeeklyNutritionSummary weekStart={WEEK} entries={weekEntries()} />);
    await screen.findByText(/daily average/i);
    fireEvent.click(screen.getByRole('tab', { name: /tue/i }));
    expect(await screen.findByText('Leftover Pizza')).toBeTruthy();
    expect(screen.getByText(/no nutrition data/i)).toBeTruthy();
  });

  it('shows a loading state while queries are pending', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {})); // never resolves
    renderWithClient(<WeeklyNutritionSummary weekStart={WEEK} entries={weekEntries()} />);
    expect(await screen.findByRole('status')).toBeTruthy();
  });
});
