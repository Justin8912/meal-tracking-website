import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { MealLibrary } from './MealLibrary.js';

/**
 * STEP-42 (test-first for STEP-43): the search box sets `q` in the recipes
 * query key (debounced) so results come from the server search (AC-6.1). A
 * no-match response must render an explicit empty-state message (AC-6.2),
 * distinguishable from the loading and initial states so the user never stares
 * at a blank panel. Fetch is mocked.
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

function recipe(id: string, name: string) {
  return {
    id,
    name,
    mealType: 'lunch',
    servings: 1,
    notes: null,
    sourceLink: null,
    createdAt: '2026-05-30T00:00:00.000Z',
    updatedAt: '2026-05-30T00:00:00.000Z',
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('MealLibrary search', () => {
  it('searches via the query key and shows an empty state on no match (AC-6.1/6.2)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    const recipeUrls: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/tags')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/recipes')) {
        recipeUrls.push(url);
        if (url.includes('q=zzz')) {
          return Promise.resolve(jsonResponse([]));
        }
        if (url.includes('q=chick')) {
          return Promise.resolve(
            jsonResponse([
              recipe('11111111-1111-1111-1111-111111111111', 'Chicken Bowl'),
            ]),
          );
        }
        return Promise.resolve(
          jsonResponse([
            recipe('11111111-1111-1111-1111-111111111111', 'Chicken Bowl'),
            recipe('22222222-2222-2222-2222-222222222222', 'Tofu Stir Fry'),
          ]),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderWithClient(<MealLibrary />);

    expect(await screen.findByText('Tofu Stir Fry')).toBeTruthy();

    const searchBox = screen.getByLabelText(/search recipes/i);

    // Type "chick" -> debounced -> q=chick -> Chicken Bowl only (AC-6.1).
    fireEvent.change(searchBox, { target: { value: 'chick' } });
    await waitFor(() => {
      expect(screen.getByText('Chicken Bowl')).toBeTruthy();
      expect(screen.queryByText('Tofu Stir Fry')).toBeNull();
    });
    expect(recipeUrls.some((u) => u.includes('q=chick'))).toBe(true);

    // Type "zzz" -> debounced -> q=zzz -> empty -> empty-state message (AC-6.2).
    fireEvent.change(searchBox, { target: { value: 'zzz' } });
    expect(await screen.findByText(/no recipes found/i)).toBeTruthy();
    expect(recipeUrls.some((u) => u.includes('q=zzz'))).toBe(true);
  });
});
