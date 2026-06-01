import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  within,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { PlanEntry } from '@meal-tracking/shared';
import { computeRecipeNutrition, formatNutrition } from '@meal-tracking/nutrition-engine';
import type { NutritionLine } from '@meal-tracking/nutrition-engine';
import { PlannedMealDetail } from './PlannedMealDetail.js';

/**
 * STEP-15 (test-first for STEP-16): the planned-meal detail view covers three
 * meal kinds and must never re-implement nutrition.
 *
 * The detail branches on the entry shape (AD-3):
 *   * a FREEFORM entry shows its own title/description/link, and the link is
 *     omitted entirely when absent (no broken/empty anchor) — AC-2.1;
 *   * a RECIPE-BACKED entry reads the recipe via recipe-library `GET /recipes/:id`
 *     for notes/link and composes its nutrition breakdown CLIENT-SIDE through the
 *     shared engine: the recipe usage (`GET /recipes/:id`) joined to per-
 *     ingredient nutrition (`GET /ingredients`), fed to `computeRecipeNutrition`
 *     and rendered only through `formatNutrition` (rounding lives in the engine,
 *     S-5) — AC-2.2;
 *   * a TOMBSTONED entry (recipe_id NULL, no freeform fields) shows a clear
 *     "recipe removed" state rather than crashing or showing blank nutrition
 *     (AD-3).
 *
 * Fails before STEP-16 (the component does not exist).
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
const ING_POWDER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

/** A recipe-backed plan entry (recipe_id set). */
function recipeEntry(): PlanEntry {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    weekStartDate: '2026-06-01',
    dayOfWeek: 0,
    mealSlot: 'breakfast',
    position: 0,
    recipeId: RECIPE_ID,
    recipeName: 'Oatmeal Bowl',
    freeformTitle: null,
    freeformDescription: null,
    freeformLink: null,
  };
}

/** A freeform plan entry. `link`/`description` may be null to test omission. */
function freeformEntry(overrides: Partial<PlanEntry> = {}): PlanEntry {
  return {
    id: '44444444-4444-4444-4444-444444444444',
    weekStartDate: '2026-06-01',
    dayOfWeek: 1,
    mealSlot: 'lunch',
    position: 0,
    recipeId: null,
    freeformTitle: 'Leftover Pizza',
    freeformDescription: 'Two slices from last night',
    freeformLink: 'https://example.com/pizza',
    ...overrides,
  };
}

/** A tombstoned entry: the referenced recipe was deleted (recipe_id NULL, no freeform). */
function tombstoneEntry(): PlanEntry {
  return {
    id: '55555555-5555-5555-5555-555555555555',
    weekStartDate: '2026-06-01',
    dayOfWeek: 2,
    mealSlot: 'dinner',
    position: 0,
    recipeId: null,
    freeformTitle: null,
    freeformDescription: null,
    freeformLink: null,
  };
}

/** The recipe-detail body returned by GET /recipes/:id (usage + notes/link). */
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
    { ingredientId: ING_POWDER, name: 'Protein Powder', quantity: 30, unitCode: 'g' },
  ],
  tags: ['high-protein'],
};

/** The ingredient list returned by GET /ingredients (per-referenceGrams nutrition). */
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
  {
    id: ING_POWDER,
    name: 'Protein Powder',
    source: 'custom',
    fdcId: null,
    referenceGrams: 100,
    gramWeightPerQty: null,
    unitGramEquivalents: {},
    nutrition: {
      calories: 375,
      proteinG: 80,
      carbsG: 8,
      fatG: 4,
      // fiber intentionally omitted -> must stay unknown (flagged, not 0).
      micronutrients: {},
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

/**
 * The independently-derived expected per-serving display values: build the
 * engine lines exactly as the component must (recipe usage joined to ingredient
 * nutrition) and round only through formatNutrition. The test never hardcodes a
 * rounded number — it asserts the component agrees with the shared engine.
 */
function expectedPerServing(): ReturnType<typeof formatNutrition> {
  const byId = new Map(INGREDIENT_LIST.map((i) => [i.id, i]));
  const lines: NutritionLine[] = RECIPE_DETAIL.ingredients.map((ri) => {
    const ing = byId.get(ri.ingredientId)!;
    const n = ing.nutrition as Record<string, number | undefined> & {
      micronutrients: Record<string, never>;
    };
    return {
      quantity: ri.quantity,
      unitCode: ri.unitCode,
      ingredient: {
        id: ing.id,
        referenceGrams: ing.referenceGrams,
        gramEquivalents: ing.unitGramEquivalents,
        gramWeightPerQty: ing.gramWeightPerQty,
        nutrition: {
          calories: n.calories ?? 0,
          proteinG: n.proteinG ?? 0,
          carbsG: n.carbsG ?? 0,
          fatG: n.fatG ?? 0,
          fiberG: n.fiberG ?? 0,
          micronutrients: ing.nutrition.micronutrients,
        },
      },
    };
  });
  return formatNutrition(computeRecipeNutrition(lines, RECIPE_DETAIL.servings).perServing);
}

/** Mock fetch: route GET /recipes/:id and GET /ingredients to fixtures. */
function mockRecipeReads(): void {
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
    return Promise.resolve(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
}

describe('PlannedMealDetail', () => {
  it('freeform entry shows its title, description, and link (AC-2.1)', () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    renderWithClient(<PlannedMealDetail entry={freeformEntry()} />);

    const detail = screen.getByRole('region', { name: /meal detail/i });
    expect(within(detail).getByText('Leftover Pizza')).toBeTruthy();
    expect(
      within(detail).getByText(/two slices from last night/i),
    ).toBeTruthy();
    const link = within(detail).getByRole('link');
    expect(link.getAttribute('href')).toBe('https://example.com/pizza');
  });

  it('omits the link entirely when a freeform entry has none (AC-2.1)', () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    renderWithClient(
      <PlannedMealDetail entry={freeformEntry({ freeformLink: null })} />,
    );

    const detail = screen.getByRole('region', { name: /meal detail/i });
    // No broken/empty anchor when there is no link.
    expect(within(detail).queryByRole('link')).toBeNull();
  });

  it('recipe entry shows the recipe notes and link from GET /recipes/:id (AC-2.1)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockRecipeReads();
    renderWithClient(<PlannedMealDetail entry={recipeEntry()} />);

    const detail = screen.getByRole('region', { name: /meal detail/i });
    expect(
      await within(detail).findByText(/soak the oats overnight/i),
    ).toBeTruthy();
    const link = within(detail).getByRole('link');
    expect(link.getAttribute('href')).toBe('https://example.com/oatmeal');
  });

  it('recipe entry surfaces the nutrition breakdown via the shared engine, rounded only at display (AC-2.2)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockRecipeReads();
    renderWithClient(<PlannedMealDetail entry={recipeEntry()} />);

    const expected = expectedPerServing();

    // Calories: rendered exactly as the engine's formatNutrition produces them
    // (the component must not round on its own, S-5).
    const calories = await screen.findByLabelText(/per-serving calories/i);
    expect(calories.textContent).toBe(String(expected.calories));

    const protein = screen.getByLabelText(/per-serving protein/i);
    expect(protein.textContent).toBe(String(expected.proteinG));
    const carbs = screen.getByLabelText(/per-serving carbs/i);
    expect(carbs.textContent).toBe(String(expected.carbsG));
    const fat = screen.getByLabelText(/per-serving fat/i);
    expect(fat.textContent).toBe(String(expected.fatG));
  });

  it('flags incomplete nutrition rather than zero-filling missing data (S-5)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockRecipeReads();
    renderWithClient(<PlannedMealDetail entry={recipeEntry()} />);

    // The protein powder omits fiber -> the recipe is incomplete and the detail
    // surfaces that rather than presenting a misleading complete total.
    expect(await screen.findByRole('note')).toBeTruthy();
    expect(screen.getByText(/incomplete/i)).toBeTruthy();
  });

  it('tombstoned entry (recipe_id NULL) shows a "recipe removed" state, no nutrition (AD-3)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockRecipeReads();
    renderWithClient(<PlannedMealDetail entry={tombstoneEntry()} />);

    const detail = screen.getByRole('region', { name: /meal detail/i });
    expect(within(detail).getByText(/recipe removed/i)).toBeTruthy();
    // No nutrition section and no recipe fetch attempt for a tombstone.
    expect(screen.queryByLabelText(/per-serving calories/i)).toBeNull();
    await waitFor(() => {
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });
});
