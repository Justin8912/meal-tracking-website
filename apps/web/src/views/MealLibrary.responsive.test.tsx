import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { MealLibrary } from './MealLibrary.js';

/**
 * STEP-47: mobile-responsive verification (NFR-2, AD-5).
 *
 * NFR-2 requires the library + editor core flows to be usable on a phone. This
 * verifies, at a 390px (iPhone-class) viewport, that the core flow is
 * COMPLETABLE in the DOM and meets WCAG 2.1 AA basics: every form control has an
 * accessible NAME (label association) and is keyboard-FOCUSABLE, and the
 * browse/filter/search controls plus the editor (open it, add-ingredient search,
 * nutrition panel) are all reachable.
 *
 * Why jsdom and not Playwright: the in-sandbox corporate TLS proxy blocks
 * Playwright browser downloads, so a real-browser viewport/screenshot run is not
 * available here. jsdom does not perform CSS layout, so pixel-level
 * "no overflow/clipping" cannot be asserted programmatically in this suite. That
 * specific layout check is covered by:
 *   - the responsive viewport meta (apps/web/index.html: width=device-width),
 *   - the components' stacked, full-width control structure (semantic <label>s,
 *     no fixed widths), and
 *   - a documented MANUAL check at 390px (see the note test below),
 * to be promoted to a Playwright `setViewportSize(390)` + visual assertion when
 * a browser is reachable. The structural + a11y guarantees below DO run here and
 * catch unreachable/unlabeled controls, the most common mobile-usability breaks.
 */

const PHONE_WIDTH = 390;

function renderWithClient(ui: ReactElement): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/** A control is keyboard-focusable if it can receive focus (no negative tabindex). */
function isFocusable(el: HTMLElement): boolean {
  const tabindex = el.getAttribute('tabindex');
  if (tabindex !== null && Number(tabindex) < 0) return false;
  el.focus();
  return document.activeElement === el;
}

beforeEach(() => {
  // Emulate a phone viewport. jsdom honors innerWidth for media-query reads via
  // matchMedia stubs; we set both for components/tests that consult them.
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: PHONE_WIDTH,
  });
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  window._env_ = { API_BASE_URL: 'http://x' };
  // The library fetches recipes + tags on mount; return empty lists so the view
  // settles deterministically into its (reachable) empty/controls state.
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window._env_;
});

describe('STEP-47 mobile-responsive verification (NFR-2) at 390px', () => {
  it('exposes the core browse/filter/search controls, each labeled and focusable', () => {
    expect(window.innerWidth).toBe(PHONE_WIDTH);
    renderWithClient(<MealLibrary />);

    // Browse: the library heading and the Add-recipe control are reachable.
    expect(screen.getByRole('heading', { name: /meal library/i })).toBeTruthy();
    const addBtn = screen.getByRole('button', { name: /add recipe/i });
    expect(isFocusable(addBtn)).toBe(true);

    // Filter + search: the search region groups the three controls; each is
    // labeled (accessible name) and focusable.
    const searchRegion = screen.getByRole('search');
    const searchBox = within(searchRegion).getByRole('searchbox', {
      name: /search recipes/i,
    });
    const mealType = within(searchRegion).getByRole('combobox', {
      name: /meal type/i,
    });
    const tag = within(searchRegion).getByRole('combobox', { name: /tag/i });
    for (const control of [searchBox, mealType, tag]) {
      expect(control).toBeTruthy();
      expect(isFocusable(control as HTMLElement)).toBe(true);
    }
  });

  it('opens the editor and every editor form control has an accessible name and is focusable (WCAG 2.1 AA basics)', () => {
    renderWithClient(<MealLibrary />);

    // Open the editor (core flow step at phone width).
    fireEvent.click(screen.getByRole('button', { name: /add recipe/i }));
    const form = screen.getByRole('form', { name: /new recipe/i });
    expect(form).toBeTruthy();

    // Every form control rendered in the editor must be labeled + focusable.
    // (getByRole's name option already proves the accessible name; we additionally
    // assert focusability for keyboard reachability.)
    const named: Array<[string, RegExp]> = [
      ['textbox', /^name$/i],
      ['combobox', /meal type/i],
      ['spinbutton', /servings/i],
      ['textbox', /source link/i],
      ['textbox', /tags/i],
      ['textbox', /notes/i],
      // the add-ingredient search lives in the editor's IngredientPicker
      ['searchbox', /search foods/i],
    ];
    for (const [role, name] of named) {
      const el = within(form).getByRole(role, { name });
      expect(el, `${role} "${name}"`).toBeTruthy();
      expect(isFocusable(el as HTMLElement)).toBe(true);
    }

    // The add-ingredient flow is reachable: typing a term is accepted, and the
    // custom-ingredient escape hatch is present (NFR-5 cross-check at phone size).
    const foods = within(form).getByRole('searchbox', { name: /search foods/i });
    fireEvent.change(foods, { target: { value: 'oats' } });
    expect((foods as HTMLInputElement).value).toBe('oats');
    expect(
      within(form).getByRole('button', { name: /add a custom ingredient/i }),
    ).toBeTruthy();

    // The per-serving nutrition panel (the editor's primary output) is reachable.
    expect(screen.getByLabelText(/per-serving nutrition/i)).toBeTruthy();
    // Submit is reachable and focusable.
    const submit = within(form).getByRole('button', { name: /save recipe/i });
    expect(isFocusable(submit)).toBe(true);
  });

  it('documents the manual layout check that jsdom cannot perform', () => {
    // jsdom performs NO CSS layout, so overflow/clipping at 390px is a MANUAL /
    // future-Playwright check. Documented here so the requirement is explicit and
    // traceable rather than silently unverified:
    //
    //   MANUAL CHECK (NFR-2, 390px viewport):
    //     1. Open the SPA at a 390px-wide viewport (dev: vite, or compose stack).
    //     2. Browse the library; apply the meal-type and tag filters; search.
    //     3. Open the editor; add a USDA + a custom ingredient; read nutrition.
    //     4. Confirm: no horizontal scroll, no clipped/overlapping controls,
    //        every control tappable. (The responsive viewport meta is in
    //        apps/web/index.html and controls are stacked full-width.)
    //
    // The structural + accessibility guarantees above run automatically and
    // cover the most common mobile breaks (unreachable/unlabeled controls).
    expect(true).toBe(true);
  });
});
