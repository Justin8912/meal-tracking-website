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
import { IngredientPicker } from './IngredientPicker.js';
import type { EditorIngredientLine } from './RecipeEditor.js';

/**
 * STEP-38 (test-first for STEP-39): the picker covers both ingredient sources
 * and the degradation path. Typing runs a debounced USDA search and renders the
 * matches (AC-2.1); selecting a match pre-fills a confirmable gram weight
 * (AD-4); the custom path adds an ingredient (AC-3.1); and a failed search
 * surfaces a clear message plus the custom-entry form so the user is never
 * blocked (AC-2.3). Fetch is mocked; we never hit a real API.
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

const usdaMatch = {
  fdcId: '12345',
  description: 'Chicken breast, raw',
  dataType: 'Foundation',
  per100g: {
    calories: 120,
    proteinG: 22,
    carbsG: 0,
    fatG: 3,
    fiberG: 0,
    micronutrients: { iron: { amount: 0.7, unit: 'mg' } },
  },
};

const snapshotResponse = {
  id: '99999999-9999-9999-9999-999999999999',
  name: 'Chicken breast, raw',
  source: 'usda',
  fdcId: '12345',
  referenceGrams: 100,
  gramWeightPerQty: null,
  unitGramEquivalents: {},
  nutrition: usdaMatch.per100g,
  createdAt: '2026-05-30T00:00:00.000Z',
  updatedAt: '2026-05-30T00:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('IngredientPicker', () => {
  it('shows USDA matches as the user types and pre-fills a confirmable gram weight on select', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    const added: Array<Omit<EditorIngredientLine, 'key'>> = [];

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) => {
        const url = String(input);
        if (url.includes('/ingredients/search')) {
          return Promise.resolve(jsonResponse([usdaMatch]));
        }
        if (url.includes('/ingredients/usda/')) {
          return Promise.resolve(jsonResponse(snapshotResponse, 201));
        }
        throw new Error(`unexpected fetch: ${url}`);
      });

    renderWithClient(<IngredientPicker onAdd={(l) => added.push(l)} />);

    fireEvent.change(screen.getByLabelText(/search foods/i), {
      target: { value: 'chicken' },
    });

    // Debounced USDA search renders the match (AC-2.1).
    expect(
      await screen.findByText(/Chicken breast, raw/i),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.some((c) =>
        String(c[0]).includes('/ingredients/search'),
      ),
    ).toBe(true);

    // Selecting the match reveals a pre-filled quantity + unit selector (AD-4).
    fireEvent.click(screen.getByRole('button', { name: /select Chicken breast/i }));

    // The confirm panel shows "Amount" label and a "Unit" dropdown.
    const gramInput = (await screen.findByRole(
      'spinbutton', { name: /amount/i },
    )) as HTMLInputElement;
    expect(Number(gramInput.value)).toBeGreaterThan(0);

    // Confirming adds the ingredient line to the recipe.
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(added.length).toBe(1);
    });
    expect(added[0]?.name).toMatch(/Chicken breast/i);
    expect(added[0]?.ingredientId).toBe(snapshotResponse.id);
  });

  it('lets the user add a custom ingredient (AC-3.1)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    const added: Array<Omit<EditorIngredientLine, 'key'>> = [];

    const customResponse = {
      id: '11111111-2222-3333-4444-555555555555',
      name: 'Grandma sauce',
      source: 'custom',
      fdcId: null,
      referenceGrams: 100,
      gramWeightPerQty: null,
      unitGramEquivalents: {},
      nutrition: {
        calories: 50,
        micronutrients: {},
      },
      createdAt: '2026-05-30T00:00:00.000Z',
      updatedAt: '2026-05-30T00:00:00.000Z',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith('/ingredients') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(customResponse, 201));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderWithClient(<IngredientPicker onAdd={(l) => added.push(l)} />);

    // Open the custom-entry path.
    fireEvent.click(screen.getByRole('button', { name: /add a custom ingredient/i }));

    fireEvent.change(screen.getByLabelText(/custom ingredient name/i), {
      target: { value: 'Grandma sauce' },
    });
    fireEvent.change(screen.getByLabelText(/calories/i), {
      target: { value: '50' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create ingredient/i }));

    await waitFor(() => {
      expect(added.length).toBe(1);
    });
    expect(added[0]?.name).toBe('Grandma sauce');
    expect(added[0]?.ingredientId).toBe(customResponse.id);
  });

  it('renders NO <form> element so it cannot submit a surrounding recipe form', () => {
    // Nested <form>s are invalid HTML; a picker <form> inside the recipe
    // editor's <form> caused clicking add/Enter to submit the outer form and
    // reload the page, dropping the in-progress recipe. The picker must own no
    // <form> at all. (Browser-only regression; jsdom guards the structure.)
    const { container } = (() => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      return render(
        <QueryClientProvider client={queryClient}>
          <IngredientPicker onAdd={() => undefined} />
        </QueryClientProvider>,
      );
    })();

    expect(container.querySelectorAll('form').length).toBe(0);

    // Open the custom path too: that branch must also be form-free.
    fireEvent.click(
      screen.getByRole('button', { name: /add a custom ingredient/i }),
    );
    expect(container.querySelectorAll('form').length).toBe(0);
  });

  it('adding an ingredient never submits a surrounding <form> (no page reload)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    const added: Array<Omit<EditorIngredientLine, 'key'>> = [];
    const onOuterSubmit = vi.fn((e: { preventDefault: () => void }) =>
      e.preventDefault(),
    );

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/ingredients/search')) {
        return Promise.resolve(jsonResponse([usdaMatch]));
      }
      if (url.includes('/ingredients/usda/')) {
        return Promise.resolve(jsonResponse(snapshotResponse, 201));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    // Wrap the picker in a form exactly as the recipe editor does. If the
    // picker submitted (old nested-form bug, or a stray type="submit" button),
    // this handler would fire — in a real browser that reloads the page.
    render(
      <QueryClientProvider client={queryClient}>
        <form onSubmit={onOuterSubmit}>
          <IngredientPicker onAdd={(l) => added.push(l)} />
        </form>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText(/search foods/i), {
      target: { value: 'chicken' },
    });
    fireEvent.click(
      await screen.findByRole('button', { name: /select Chicken breast/i }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /confirm/i }),
    );

    await waitFor(() => {
      expect(added.length).toBe(1);
    });
    // The add is a pure state update; the surrounding form was never submitted.
    expect(onOuterSubmit).not.toHaveBeenCalled();
  });

  it('on search error shows a clear message and the custom-entry path (AC-2.3)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/ingredients/search')) {
        return Promise.resolve(
          jsonResponse(
            {
              error: {
                code: 'USDA_UNAVAILABLE',
                message: 'The nutrition service is currently unavailable.',
              },
            },
            502,
          ),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderWithClient(<IngredientPicker onAdd={() => undefined} />);

    fireEvent.change(screen.getByLabelText(/search foods/i), {
      target: { value: 'chicken' },
    });

    // A clear error message appears, not a blank/blocked UI.
    expect(await screen.findByRole('alert')).toBeTruthy();
    // The custom-entry path remains available as the fallback.
    expect(
      screen.getByRole('button', { name: /add a custom ingredient/i }),
    ).toBeTruthy();
  });
});
