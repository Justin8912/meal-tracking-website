import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  within,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { WeeklyPlanner } from './WeeklyPlanner.js';

/**
 * STEP-7 (test-first for STEP-8): the defining risk is AC-1.6 — a save failure
 * must surface a clear "not saved" error AND keep the user's in-progress entry
 * visible (never silently lost or blanked). These tests open a day's freeform
 * add form, force the mutation's network call to fail, and assert:
 *   * a clear error is shown (role=alert), and
 *   * the title the user typed is still in the form afterward (not cleared).
 * Retries are off so the failure surfaces deterministically.
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

/** Mock fetch: GET /plans returns []; any non-GET (the mutation) returns a 500 envelope. */
function mockSaveFailure(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET') {
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({
          error: { code: 'PERSISTENCE_FAILED', message: 'save blew up' },
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  });
}

describe('WeeklyPlanner freeform save failure (AC-1.6)', () => {
  it('shows a clear error and keeps the typed entry when the save fails', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockSaveFailure();

    renderWithClient(<WeeklyPlanner />);

    // Open Monday's add form.
    const monday = await screen.findByRole('listitem', { name: 'Monday' });
    fireEvent.click(within(monday).getByRole('button', { name: /add meal/i }));

    // Type a freeform title and submit.
    const titleInput = within(monday).getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: 'Spaghetti Night' } });
    fireEvent.click(within(monday).getByRole('button', { name: /^save/i }));

    // A clear "not saved" error surfaces.
    await waitFor(() => {
      expect(within(monday).getByRole('alert').textContent).toMatch(
        /not saved|could not save|failed/i,
      );
    });

    // The in-progress entry is NOT lost: the title the user typed is still there.
    expect(
      (within(monday).getByLabelText(/title/i) as HTMLInputElement).value,
    ).toBe('Spaghetti Night');
  });
});
