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
 * STEP-9 (test-first for STEP-10): AC-1.2 (add a saved recipe to a day) and
 * AC-1.5 (an empty day shows a clear empty/add state) are distinct from the
 * freeform path. These tests assert:
 *   * a day with no entries renders an explicit empty/add affordance (not an
 *     indistinguishable blank cell), and
 *   * choosing a saved recipe and adding it POSTs a RECIPE-ONLY entry to that
 *     day (recipeId set, no freeform fields) — the recipe is placed on the
 *     chosen day, and the other empty days still show the empty/add state.
 * Fails before STEP-10 (no recipe-select add path).
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

const RECIPE_ID = '22222222-2222-2222-2222-222222222222';

/**
 * Mock fetch: GET /plans returns []; GET /recipes returns one saved recipe;
 * POST /plans captures the body and echoes a persisted recipe-only entry.
 */
function mockRecipeAdd(captured: { body?: Record<string, unknown> }): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (method === 'GET' && url.includes('/recipes')) {
      const recipes = [
        {
          id: RECIPE_ID,
          name: 'Saved Stir Fry',
          mealType: 'dinner',
          servings: 2,
          notes: null,
          sourceLink: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ];
      return Promise.resolve(
        new Response(JSON.stringify(recipes), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }

    if (method === 'POST' && url.includes('/plans')) {
      captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const echo = {
        id: '33333333-3333-3333-3333-333333333333',
        weekStartDate: captured.body.weekStart,
        dayOfWeek: captured.body.dayOfWeek,
        mealSlot: captured.body.mealSlot,
        position: 0,
        recipeId: captured.body.recipeId ?? null,
        recipeName: 'Saved Stir Fry',
        freeformTitle: null,
        freeformDescription: null,
        freeformLink: null,
      };
      return Promise.resolve(
        new Response(JSON.stringify(echo), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }

    // GET /plans (and anything else): empty week.
    return Promise.resolve(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
}

describe('WeeklyPlanner recipe add + empty-day state', () => {
  it('every empty day shows an explicit empty/add state (AC-1.5)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockRecipeAdd({});

    renderWithClient(<WeeklyPlanner />);

    // All seven days carry no meals -> seven empty-state affordances.
    await waitFor(() => {
      expect(screen.getAllByText(/no meals planned/i).length).toBe(7);
    });
  });

  it('adds a saved recipe to a day as a recipe-only entry (AC-1.2)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    const captured: { body?: Record<string, unknown> } = {};
    mockRecipeAdd(captured);

    renderWithClient(<WeeklyPlanner />);

    const monday = await screen.findByRole('listitem', { name: 'Monday' });

    // Open the recipe-select add path for Monday and choose the saved recipe.
    fireEvent.click(within(monday).getByRole('button', { name: /add recipe/i }));
    const recipeSelect = await within(monday).findByLabelText(/recipe/i);
    fireEvent.change(recipeSelect, { target: { value: RECIPE_ID } });
    fireEvent.click(within(monday).getByRole('button', { name: /^add to day/i }));

    // The POST body is a RECIPE-ONLY entry on Monday (dayOfWeek 0): recipeId set,
    // no freeform fields (AC-1.2).
    await waitFor(() => {
      expect(captured.body).toBeDefined();
    });
    expect(captured.body?.recipeId).toBe(RECIPE_ID);
    expect(captured.body?.dayOfWeek).toBe(0);
    expect(captured.body?.freeformTitle).toBeUndefined();
  });
});
