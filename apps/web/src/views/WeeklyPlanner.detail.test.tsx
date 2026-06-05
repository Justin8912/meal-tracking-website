import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  within,
  fireEvent,
  cleanup,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { WeeklyPlanner } from './WeeklyPlanner.js';

/**
 * STEP-16 (Bundle Verify, integration): clicking a planned meal in the week
 * grid opens its detail. Given a week with a freeform meal and a recipe-backed
 * meal, clicking each opens the detail showing notes + link (if present); for
 * the recipe meal the nutrition breakdown is available, read via recipe-library
 * `GET /recipes/:id` and composed client-side through the shared engine
 * (AC-2.1/AC-2.2). The detail is wired in WeeklyPlanner, not just the isolated
 * component.
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
const ING_OATS = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

/** A freeform entry on Monday (dayOfWeek 0) and a recipe-backed entry on Tuesday (1). */
const WEEK_ENTRIES = [
  {
    id: 'ff000000-0000-0000-0000-000000000001',
    weekStartDate: '2026-06-01',
    dayOfWeek: 0,
    mealSlot: 'lunch',
    position: 0,
    recipeId: null,
    freeformTitle: 'Leftover Pizza',
    freeformDescription: 'Two slices',
    freeformLink: 'https://example.com/pizza',
  },
  {
    id: 'rr000000-0000-0000-0000-000000000002',
    weekStartDate: '2026-06-01',
    dayOfWeek: 1,
    mealSlot: 'breakfast',
    position: 0,
    recipeId: RECIPE_ID,
    recipeName: 'Oatmeal Bowl',
    freeformTitle: null,
    freeformDescription: null,
    freeformLink: null,
  },
];

const RECIPE_DETAIL = {
  id: RECIPE_ID,
  name: 'Oatmeal Bowl',
  mealType: 'breakfast',
  servings: 2,
  notes: 'Soak the oats overnight',
  sourceLink: 'https://example.com/oatmeal',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ingredients: [
    { ingredientId: ING_OATS, name: 'Oats', quantity: 150, unitCode: 'g' },
  ],
  tags: [],
};

const INGREDIENT_LIST = [
  {
    id: ING_OATS,
    name: 'Oats',
    source: 'usda',
    fdcId: '170787',
    referenceGrams: 100,
    gramWeightPerQty: null,
    unitGramEquivalents: {},
    nutrition: {
      calories: 389,
      proteinG: 16.9,
      carbsG: 66.3,
      fatG: 6.9,
      fiberG: 10.6,
      micronutrients: {},
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

/** Mock fetch: GET /plans -> the week's entries; GET /recipes/:id and /ingredients -> fixtures. */
function mockReads(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url.includes(`/recipes/${RECIPE_ID}`)) {
      return Promise.resolve(
        new Response(JSON.stringify(RECIPE_DETAIL), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (url.includes('/ingredients')) {
      return Promise.resolve(
        new Response(JSON.stringify(INGREDIENT_LIST), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (url.includes('/plans')) {
      return Promise.resolve(
        new Response(JSON.stringify(WEEK_ENTRIES), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
}

describe('WeeklyPlanner planned-meal detail wiring (Bundle Verify, AC-2.1/AC-2.2)', () => {
  it('clicking a freeform meal opens its detail with notes + link', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockReads();
    renderWithClient(<WeeklyPlanner />);

    const monday = await screen.findByRole('listitem', { name: 'Monday' });
    fireEvent.click(within(monday).getByRole('button', { name: 'Leftover Pizza' }));

    const detail = within(monday).getByRole('region', { name: /meal detail/i });
    expect(within(detail).getByText(/two slices/i)).toBeTruthy();
    expect(within(detail).getByRole('link').getAttribute('href')).toBe(
      'https://example.com/pizza',
    );
  });

  it('clicking a recipe-backed meal opens its detail with notes/link and nutrition (AC-2.2)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockReads();
    renderWithClient(<WeeklyPlanner />);

    const tuesday = await screen.findByRole('listitem', { name: 'Tuesday' });
    fireEvent.click(within(tuesday).getByRole('button', { name: 'Oatmeal Bowl' }));

    const detail = within(tuesday).getByRole('region', { name: /meal detail/i });
    // Recipe notes/link from GET /recipes/:id.
    expect(await within(detail).findByText(/soak the oats overnight/i)).toBeTruthy();
    expect(within(detail).getByRole('link').getAttribute('href')).toBe(
      'https://example.com/oatmeal',
    );
    // Nutrition breakdown is available (composed via the shared engine).
    const calories = await within(detail).findByLabelText(/per-serving calories/i);
    // 389 kcal/100g * 150 g / 2 servings = 291.75 -> 292 (engine rounds at display).
    expect(calories.textContent).toBe('292');
  });
});
