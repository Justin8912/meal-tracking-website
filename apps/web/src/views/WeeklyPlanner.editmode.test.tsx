import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  within,
  waitFor,
  fireEvent,
  cleanup,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { WeeklyPlanner } from './WeeklyPlanner.js';

/**
 * STEP-17 (test-first for STEP-18): edit mode reveals a distinct two-panel
 * layout - the filterable recipe palette on the LEFT and the week on the RIGHT
 * (AC-4.1). The palette reuses recipe-library's server-side GET /recipes filters
 * via the TanStack Query KEY (mealType/tag), not client-side array filtering;
 * selecting a meal type or a tag must change the request and narrow the rendered
 * palette (AC-4.2). Fetch is mocked. Fails before STEP-18 (no edit mode yet).
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

/** Default mock: empty plan, two tags, recipe list narrowing on mealType=dinner. */
function mockApi(recipeUrls: string[]): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/plans')) {
      return Promise.resolve(jsonResponse([]));
    }
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
      if (url.includes('mealType=dinner')) {
        return Promise.resolve(
          jsonResponse([
            recipe('11111111-1111-1111-1111-111111111111', 'Quick Dinner', 'dinner'),
          ]),
        );
      }
      if (url.includes('tag=vegan')) {
        return Promise.resolve(
          jsonResponse([
            recipe('22222222-2222-2222-2222-222222222222', 'Tofu Bowl', 'lunch'),
          ]),
        );
      }
      return Promise.resolve(
        jsonResponse([
          recipe('11111111-1111-1111-1111-111111111111', 'Quick Dinner', 'dinner'),
          recipe('33333333-3333-3333-3333-333333333333', 'Big Breakfast', 'breakfast'),
        ]),
      );
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe('WeeklyPlanner edit mode', () => {
  it('toggles a two-panel layout with the recipe palette on the left and the week on the right', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockApi([]);

    renderWithClient(<WeeklyPlanner />);

    // The week renders; the palette is hidden until edit mode is on.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /weekly planner/i })).toBeTruthy(),
    );
    expect(screen.queryByRole('complementary', { name: /recipe palette/i })).toBeNull();

    // Toggle edit mode.
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    // The two-panel edit layout appears: a recipe palette region + the week.
    const palette = await screen.findByRole('complementary', {
      name: /recipe palette/i,
    });
    expect(palette).toBeTruthy();
    expect(screen.getByRole('list', { name: /days of the week/i })).toBeTruthy();
  });

  it('narrows the palette via the server filter when a meal type is selected (query key)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    const recipeUrls: string[] = [];
    mockApi(recipeUrls);

    renderWithClient(<WeeklyPlanner />);

    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));

    const palette = await screen.findByRole('complementary', {
      name: /recipe palette/i,
    });

    // Initial unfiltered palette shows both recipes.
    expect(await within(palette).findByText('Quick Dinner')).toBeTruthy();
    expect(within(palette).getByText('Big Breakfast')).toBeTruthy();

    // Select meal type = dinner -> query key changes -> server-filtered refetch.
    fireEvent.change(within(palette).getByLabelText(/meal type/i), {
      target: { value: 'dinner' },
    });

    await waitFor(() => {
      expect(within(palette).getByText('Quick Dinner')).toBeTruthy();
      expect(within(palette).queryByText('Big Breakfast')).toBeNull();
    });
    expect(recipeUrls.some((u) => u.includes('mealType=dinner'))).toBe(true);
  });

  it('narrows the palette via the server filter when a tag is selected (query key)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    const recipeUrls: string[] = [];
    mockApi(recipeUrls);

    renderWithClient(<WeeklyPlanner />);

    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    const palette = await screen.findByRole('complementary', {
      name: /recipe palette/i,
    });

    expect(await within(palette).findByText('Quick Dinner')).toBeTruthy();

    fireEvent.change(within(palette).getByLabelText(/^tag/i), {
      target: { value: 'vegan' },
    });

    await waitFor(() => {
      expect(within(palette).getByText('Tofu Bowl')).toBeTruthy();
      expect(within(palette).queryByText('Quick Dinner')).toBeNull();
    });
    expect(recipeUrls.some((u) => u.includes('tag=vegan'))).toBe(true);
  });
});
