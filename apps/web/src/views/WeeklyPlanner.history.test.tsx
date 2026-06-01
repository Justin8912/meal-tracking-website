import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  cleanup,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { WeeklyPlanner } from './WeeklyPlanner.js';

/**
 * STEP-13 (test-first for STEP-14): the history guarantee, AC-3.3. A past week
 * that had meals must still show them when revisited later, read from the
 * server (via the week-keyed query) rather than ephemeral client state. This
 * test navigates away from the initial week and back AFTER the cache for that
 * week has been cleared (a cold cache / eviction), and asserts the meal is
 * re-fetched and shown again — proving it is not held only in component state.
 *
 * Retries off; gcTime/staleTime 0 so a navigated-away week is evicted, forcing
 * a real refetch on return (mirrors a cold cache).
 */
function renderWithClient(ui: ReactElement): { client: QueryClient } {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { client };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window._env_;
});

describe('WeeklyPlanner history retained across navigation (AC-3.3)', () => {
  it('re-reads a revisited week from the server after a cold cache', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };

    // Per-week server data; counts fetches per week so we can prove a real
    // refetch happened on return (not a render from stale client state).
    const fetchesPerWeek = new Map<string, number>();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : String(input);
      const parsed = new URL(url, 'http://x');
      const weekStart = parsed.searchParams.get('weekStart')!;
      // The weekly summary (GET /plans/summary) also fetches per week; this
      // test counts the PLAN-LIST reads only, so route the summary to its own
      // (macros-only) body and leave the per-week plan-fetch count untouched.
      if (parsed.pathname.endsWith('/plans/summary')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              weekStartDate: weekStart,
              totals: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
              countedEntryIds: [],
              excludedEntryIds: [`id-${weekStart}`],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      fetchesPerWeek.set(weekStart, (fetchesPerWeek.get(weekStart) ?? 0) + 1);
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              id: `id-${weekStart}`,
              weekStartDate: weekStart,
              dayOfWeek: 0,
              mealSlot: 'breakfast',
              position: 0,
              recipeId: null,
              freeformTitle: `Saved meal ${weekStart}`,
              freeformDescription: null,
              freeformLink: null,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });

    renderWithClient(<WeeklyPlanner />);

    const initial = await screen.findByText(/^Saved meal /);
    const initialWeek = initial.textContent!.replace('Saved meal ', '');
    expect(fetchesPerWeek.get(initialWeek)).toBe(1);

    // Navigate away to the previous week, then back to the initial week.
    fireEvent.click(screen.getByRole('button', { name: /previous week/i }));
    await screen.findByText(/^Saved meal /);
    fireEvent.click(screen.getByRole('button', { name: /next week/i }));

    // The initial week's saved meal is shown again, re-read from the server
    // (a second fetch occurred for it — not served from a never-evicted cache,
    // and not held in component state).
    expect(await screen.findByText(`Saved meal ${initialWeek}`)).toBeTruthy();
    expect(fetchesPerWeek.get(initialWeek)).toBeGreaterThanOrEqual(2);
  });
});
