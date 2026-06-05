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
import { computeRecipeNutrition, formatNutrition } from '@meal-tracking/nutrition-engine';
import type { NutritionLine } from '@meal-tracking/nutrition-engine';
import { RecipeEditor, type EditorIngredientLine } from './RecipeEditor.js';

/**
 * STEP-36 (test-first for STEP-37): AC-4.4 is the defining UX of the editor.
 * Nutrition must recompute LIVE in the browser via the shared engine the
 * instant servings (or an ingredient/quantity/unit) changes — never rounded in
 * the component (S-6, rounding only via formatNutrition) and never zero-filled
 * for missing data (the engine's completeness flag drives an "incomplete"
 * indicator instead).
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

/** A fully-resolved line the engine can compute (grams via `g` pass-through). */
function completeLine(id: string, calories: number): EditorIngredientLine {
  return {
    key: id,
    ingredientId: id,
    name: `Ingredient ${id}`,
    quantity: 100,
    unitCode: 'g',
    nutrition: {
      calories,
      proteinG: 10,
      carbsG: 20,
      fatG: 5,
      fiberG: 2,
      micronutrients: { iron: { amount: 4, unit: 'mg' } },
    },
    referenceGrams: 100,
    gramEquivalents: {},
    gramWeightPerQty: null,
  };
}

/** Compute the expected formatted per-serving calories via the shared engine. */
function expectedPerServingCalories(
  lines: EditorIngredientLine[],
  servings: number,
): number {
  const engineLines: NutritionLine[] = lines.map((l) => ({
    quantity: l.quantity,
    unitCode: l.unitCode,
    ingredient: {
      id: l.ingredientId,
      nutrition: l.nutrition,
      referenceGrams: l.referenceGrams,
      gramEquivalents: l.gramEquivalents,
      gramWeightPerQty: l.gramWeightPerQty,
    },
  }));
  const result = computeRecipeNutrition(engineLines, servings);
  return formatNutrition(result.perServing).calories;
}

describe('RecipeEditor live nutrition', () => {
  it('halves per-serving values when servings goes 1 -> 2 (via the shared engine)', () => {
    const lines = [completeLine('a', 200), completeLine('b', 300)];

    renderWithClient(<RecipeEditor initialIngredients={lines} initialServings={1} />);

    const at1 = expectedPerServingCalories(lines, 1);
    const at2 = expectedPerServingCalories(lines, 2);
    // Sanity: the two servings values genuinely differ (500 vs 250).
    expect(at1).toBe(500);
    expect(at2).toBe(250);

    const caloriesCell = screen.getByLabelText(/per-serving calories/i);
    expect(caloriesCell.textContent).toBe(String(at1));

    const servingsInput = screen.getByLabelText(/servings/i);
    fireEvent.change(servingsInput, { target: { value: '2' } });

    expect(caloriesCell.textContent).toBe(String(at2));
  });

  it('shows an incomplete indicator (not 0) when an ingredient is missing conversion data', () => {
    const complete = completeLine('a', 200);
    // A line in a volume unit with no gram-equivalent cannot resolve -> excluded
    // from sums and flagged by the engine. The UI must show "incomplete", not 0.
    const missing: EditorIngredientLine = {
      ...completeLine('b', 300),
      unitCode: 'cup',
      gramEquivalents: {},
    };

    renderWithClient(
      <RecipeEditor initialIngredients={[complete, missing]} initialServings={1} />,
    );

    // The panel-level completeness indicator is present (explains the exclusion).
    const panel = screen.getByLabelText(/per-serving nutrition/i);
    expect(within(panel).getByRole('note').textContent).toMatch(/incomplete/i);

    // The displayed per-serving calories reflect only the resolvable line
    // (200 kcal), NOT 0 and NOT the full 500 — the missing line is excluded,
    // never zero-filled (S-6).
    const caloriesCell = screen.getByLabelText(/per-serving calories/i);
    expect(caloriesCell.textContent).toBe('200');
  });

  /**
   * STEP-46 (Bundle 5 limitation guard): the editor maps an API-absent macro to
   * a placeholder 0 for engine arithmetic. That 0 must NOT make the recipe look
   * complete. With `absentMacros` set on the line, the engine flags it and the
   * editor shows the panel-level "incomplete" indicator AND a per-line note —
   * proving missing macros surface via completeness, not as a silent real 0.
   */
  it('surfaces incompleteness when an ingredient has an API-absent macro (not a silent 0)', () => {
    // Identical macro numbers; the ONLY difference is the absentMacros marker.
    const base = completeLine('a', 200);
    const absent: EditorIngredientLine = {
      ...completeLine('b', 300),
      // calories was never reported by the API: placeholder 0 in nutrition,
      // recorded as absent so the engine flags it (S-6, F-5).
      nutrition: { ...completeLine('b', 0).nutrition },
      absentMacros: ['calories'],
    };

    renderWithClient(
      <RecipeEditor initialIngredients={[base, absent]} initialServings={1} />,
    );

    const panel = screen.getByLabelText(/per-serving nutrition/i);
    expect(within(panel).getByRole('note').textContent).toMatch(/incomplete/i);

    // The per-line "incomplete data" note appears for the absent-macro line.
    const list = screen.getByLabelText(/recipe ingredients/i);
    const notes = within(list).getAllByRole('note');
    expect(notes.some((n) => /incomplete/i.test(n.textContent ?? ''))).toBe(
      true,
    );
  });

  it('does NOT flag a genuine 0 macro as incomplete (no absentMacros marker)', () => {
    // Same shape as above but the 0 is a KNOWN value: no absentMacros, so the
    // recipe is complete — the flag, not the number, carries unknown-vs-zero.
    const known0: EditorIngredientLine = {
      ...completeLine('b', 0),
    };
    renderWithClient(
      <RecipeEditor initialIngredients={[known0]} initialServings={1} />,
    );
    const panel = screen.getByLabelText(/per-serving nutrition/i);
    expect(within(panel).queryByRole('note')).toBeNull();
  });
});
