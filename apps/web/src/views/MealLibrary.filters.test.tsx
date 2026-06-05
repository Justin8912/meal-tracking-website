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
 * STEP-40 (test-first for STEP-41): the tag and meal-type filter controls must
 * drive the SERVER-side filters (Bundle 4) through the TanStack Query key
 * (AD-5), not client-side array filtering. Selecting a tag or meal type must
 * change the request (q/mealType/tag query params) so TanStack Query refetches
 * the narrowed list (AC-5.2/5.3), and the rendered list reflects the filtered
 * response. An empty filtered response shows an empty state. Fetch is mocked.
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

function recipe(id: string, name: string, mealType: string) {
  return {
    id,
    name,
    mealType,
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

describe('MealLibrary filters', () => {
  it('loads tags and filters the recipe list by tag and meal type via the query key', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    const recipeUrls: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/tags')) {
        return Promise.resolve(
          jsonResponse([
            { id: '00000000-0000-0000-0000-000000000001', label: 'quick' },
            { id: '00000000-0000-0000-0000-000000000002', label: 'vegan' },
          ]),
        );
      }
      if (url.includes('/recipes')) {
        recipeUrls.push(url);
        // Unfiltered: two recipes. Filtered by mealType=dinner: only the dinner.
        if (url.includes('mealType=dinner')) {
          return Promise.resolve(
            jsonResponse([
              recipe('11111111-1111-1111-1111-111111111111', 'Quick Dinner', 'dinner'),
            ]),
          );
        }
        return Promise.resolve(
          jsonResponse([
            recipe('11111111-1111-1111-1111-111111111111', 'Quick Dinner', 'dinner'),
            recipe('22222222-2222-2222-2222-222222222222', 'Big Breakfast', 'breakfast'),
          ]),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderWithClient(<MealLibrary />);

    // Initial unfiltered list shows both.
    expect(await screen.findByText('Big Breakfast')).toBeTruthy();
    expect(screen.getByText('Quick Dinner')).toBeTruthy();

    // The tag filter is populated from GET /tags.
    expect(await screen.findByRole('option', { name: 'quick' })).toBeTruthy();

    // Select meal type = dinner -> the query key changes -> refetch narrowed.
    fireEvent.change(screen.getByLabelText(/meal type/i), {
      target: { value: 'dinner' },
    });

    // The narrowed list resolves (new query key -> refetch). Wait for the
    // dinner-only result, then assert the breakfast recipe is gone.
    await waitFor(() => {
      expect(screen.getByText('Quick Dinner')).toBeTruthy();
      expect(screen.queryByText('Big Breakfast')).toBeNull();
    });
    expect(recipeUrls.some((u) => u.includes('mealType=dinner'))).toBe(true);
  });

  it('shows an empty state when a filter yields no recipes', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/tags')) {
        return Promise.resolve(
          jsonResponse([
            { id: '00000000-0000-0000-0000-000000000001', label: 'quick' },
          ]),
        );
      }
      if (url.includes('/recipes')) {
        if (url.includes('tag=quick')) {
          return Promise.resolve(jsonResponse([]));
        }
        return Promise.resolve(
          jsonResponse([
            recipe('11111111-1111-1111-1111-111111111111', 'Quick Dinner', 'dinner'),
          ]),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderWithClient(<MealLibrary />);

    expect(await screen.findByText('Quick Dinner')).toBeTruthy();

    fireEvent.change(await screen.findByLabelText(/tag/i), {
      target: { value: 'quick' },
    });

    expect(await screen.findByText(/no recipes match/i)).toBeTruthy();
  });
});
