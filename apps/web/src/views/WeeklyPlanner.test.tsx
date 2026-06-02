import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { WeeklyPlanner } from './WeeklyPlanner.js';

/**
 * STEP-6 verify (1st clause): with the API returning one entry for the current
 * week, the view renders all seven days Monday..Sunday (AC-1.1); the entry
 * appears on its day; empty days show an empty state, never a blank screen. The
 * view reads through the useWeekPlan TanStack Query hook, so it is wrapped in a
 * fresh QueryClientProvider per test with retries off for deterministic states.
 */
function renderWithClient(ui: ReactElement): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window._env_;
});

describe('WeeklyPlanner', () => {
  it('renders all seven days Monday through Sunday (AC-1.1)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithClient(<WeeklyPlanner />);

    for (const day of [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]) {
      expect(await screen.findByText(day)).toBeTruthy();
    }
  });

  it('shows the entry on its day and an empty state on the other days', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    // The view computes the current week's Monday client-side and queries by it;
    // echo that back as the entry's weekStartDate so it lands in the grid.
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : String(input);
      const parsed = new URL(url, 'http://x');
      // Route nutrition summary endpoints so they don't interfere with plan-list assertions.
      if (parsed.pathname.endsWith('/plans/daily-summary')) {
        return Promise.resolve(new Response(JSON.stringify(Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, hasData: false, calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }))), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (parsed.pathname.endsWith('/plans/summary')) {
        return Promise.resolve(new Response(JSON.stringify({ weekStartDate: '', totals: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }, countedEntryIds: [], excludedEntryIds: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      const weekStart = parsed.searchParams.get('weekStart');
      const body = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          weekStartDate: weekStart,
          dayOfWeek: 0,
          mealSlot: 'breakfast',
          position: 0,
          recipeId: null,
          freeformTitle: 'Avocado Toast',
          freeformDescription: null,
          freeformLink: null,
        },
      ];
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    renderWithClient(<WeeklyPlanner />);

    expect(await screen.findByText('Avocado Toast')).toBeTruthy();
    // At least one empty-day affordance exists (the other days carry no meals).
    await waitFor(() => {
      expect(screen.getAllByText(/No meals planned/i).length).toBeGreaterThan(0);
    });
  });

  it('shows a loading state while the week is fetching', () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    // A never-resolving fetch keeps the query in its loading state.
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));

    renderWithClient(<WeeklyPlanner />);

    expect(screen.getByRole('status')).toBeTruthy();
  });
});
