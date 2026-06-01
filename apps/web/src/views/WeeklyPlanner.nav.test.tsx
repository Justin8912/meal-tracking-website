import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { WeeklyPlanner } from './WeeklyPlanner.js';

/**
 * STEP-11 (test-first for STEP-12): week navigation + load-failure.
 *
 * Navigation shifts the active weekStart by +/- 7 days from the current Monday
 * (AD-2/AD-4) and re-queries the week-keyed TanStack Query, so a different week
 * shows that week's entries (AC-3.1/AC-3.2). A failed week load must show an
 * error + retry — NOT a blank or stale (previous-week) grid (AC-3.4). Retries
 * are off so the failure state surfaces deterministically.
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

/**
 * Mock GET /plans to return a single freeform entry whose title is derived from
 * the requested weekStart, so each navigated week renders a distinct, week-
 * specific meal. Returns the set of weekStarts that were actually requested.
 */
function mockPerWeekEntries(): { requested: string[] } {
  const requested: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = typeof input === 'string' ? input : String(input);
    const weekStart = new URL(url, 'http://x').searchParams.get('weekStart')!;
    requested.push(weekStart);
    const body = [
      {
        id: `id-${weekStart}`,
        weekStartDate: weekStart,
        dayOfWeek: 0,
        mealSlot: 'breakfast',
        position: 0,
        recipeId: null,
        freeformTitle: `Meal for ${weekStart}`,
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
  return { requested };
}

describe('WeeklyPlanner week navigation (AC-3.1/AC-3.2)', () => {
  it('navigating backward then forward requests the adjacent Mondays and shows their entries', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    const { requested } = mockPerWeekEntries();

    renderWithClient(<WeeklyPlanner />);

    // The initial week renders something.
    await screen.findByText(/^Meal for /);
    const initialWeek = requested[0]!;

    // Compute the expected adjacent Mondays by date arithmetic (the test's own
    // independent check, mirroring shiftWeek's contract).
    const prevWeek = new Date(`${initialWeek}T00:00:00.000Z`);
    prevWeek.setUTCDate(prevWeek.getUTCDate() - 7);
    const prevIso = prevWeek.toISOString().slice(0, 10);
    const nextWeek = new Date(`${initialWeek}T00:00:00.000Z`);
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
    const nextIso = nextWeek.toISOString().slice(0, 10);

    // Navigate to the previous week.
    fireEvent.click(screen.getByRole('button', { name: /previous week/i }));
    expect(await screen.findByText(`Meal for ${prevIso}`)).toBeTruthy();

    // Navigate forward twice (back to initial, then to next).
    fireEvent.click(screen.getByRole('button', { name: /next week/i }));
    expect(await screen.findByText(`Meal for ${initialWeek}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /next week/i }));
    expect(await screen.findByText(`Meal for ${nextIso}`)).toBeTruthy();

    expect(requested).toContain(prevIso);
    expect(requested).toContain(nextIso);
  });
});

describe('WeeklyPlanner week load failure (AC-3.4)', () => {
  it('shows an error + retry, not a blank/stale grid, and retry refetches', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };

    let attempt = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : String(input);
      const weekStart = new URL(url, 'http://x').searchParams.get('weekStart')!;
      attempt += 1;
      // First load fails; the retry (second attempt) succeeds.
      if (attempt === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: 'PERSISTENCE_FAILED', message: 'week load blew up' },
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
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
              freeformTitle: 'Recovered Meal',
              freeformDescription: null,
              freeformLink: null,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });

    renderWithClient(<WeeklyPlanner />);

    // A clear error surfaces (role=alert), distinct from a blank grid.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/could not load|failed|error/i);

    // The day grid is NOT shown in the error state (no blank/stale week).
    expect(screen.queryByLabelText('Days of the week')).toBeNull();

    // A retry control is present and refetches on click.
    const retry = screen.getByRole('button', { name: /retry|try again/i });
    fireEvent.click(retry);

    // After the retry succeeds, the week's meal renders.
    expect(await screen.findByText('Recovered Meal')).toBeTruthy();
    expect(screen.getByLabelText('Days of the week')).toBeTruthy();
  });
});
