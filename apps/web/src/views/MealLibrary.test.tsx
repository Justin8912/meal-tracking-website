import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { MealLibrary } from './MealLibrary.js';

/**
 * STEP-7 verify (1st clause): with the API returning recipes, the view renders
 * them; with an empty list it shows the empty state (never a blank screen). The
 * view reads through the useRecipes TanStack Query hook, so it is wrapped in a
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

describe('MealLibrary', () => {
  it('renders the recipes returned by the API', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Oatmeal',
            mealType: 'breakfast',
            servings: 2,
            notes: null,
            sourceLink: null,
            createdAt: '2026-05-30T00:00:00.000Z',
            updatedAt: '2026-05-30T00:00:00.000Z',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderWithClient(<MealLibrary />);

    expect(await screen.findByText('Oatmeal')).toBeTruthy();
  });

  it('shows the empty state when there are no recipes', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithClient(<MealLibrary />);

    await waitFor(() => {
      expect(screen.getByText(/No recipes yet/i)).toBeTruthy();
    });
  });
});
