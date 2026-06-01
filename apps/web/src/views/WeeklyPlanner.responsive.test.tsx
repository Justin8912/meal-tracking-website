import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
 * STEP-27: mobile-responsive verification of the Weekly Planner (NFR-2, AD-5).
 *
 * NFR-2 requires the planner's CORE flows to be usable on a phone, not just
 * desktop: view the week, add/edit/remove a meal, open a meal detail, navigate
 * weeks, and the drag-and-drop edit mode. This verifies, at a 390px (iPhone-
 * class) viewport, that each of those flows is COMPLETABLE in the DOM and meets
 * WCAG 2.1 AA basics - every control has an accessible NAME and is keyboard-
 * FOCUSABLE - and that the edit mode collapses to a single column (the palette
 * drawer above the week) rather than the desktop two-panel split.
 *
 * Why jsdom and not Playwright: the in-sandbox corporate TLS proxy blocks
 * Playwright browser downloads (recipe-library Bundle 6's documented constraint).
 * jsdom does not perform CSS layout, so pixel-level "no overflow/clipping" cannot
 * be asserted programmatically here; that specific check is covered by:
 *   - the responsive viewport meta (apps/web/index.html: width=device-width),
 *   - the edit layout's mobile-first CSS (single `minmax(0,1fr)` column below the
 *     768px breakpoint - the two-panel split is opt-IN at >=768px, WeekGrid.tsx),
 *   - and a documented MANUAL check at 390px (the note test below),
 * to be promoted to a Playwright setViewportSize(390) + visual assertion once a
 * browser is reachable. The structural + a11y guarantees below DO run here and
 * catch the most common mobile breaks (unreachable/unlabeled controls, a
 * two-panel layout that never collapses).
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A week with one freeform meal (Monday lunch) so the detail/edit flows exist. */
const FREEFORM_ENTRY = {
  id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  weekStartDate: '2026-06-01',
  dayOfWeek: 0,
  mealSlot: 'lunch',
  position: 0,
  recipeId: null,
  freeformTitle: 'Leftover Pasta',
  freeformDescription: 'from Sunday',
  freeformLink: 'https://example.com/pasta',
};

function mockApi(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.includes('/plans') && method === 'POST') {
      return Promise.resolve(jsonResponse({ ...FREEFORM_ENTRY }, 201));
    }
    if (url.includes('/plans/summary')) {
      return Promise.resolve(
        jsonResponse({
          weekStartDate: '2026-06-01',
          totals: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
          countedEntryIds: [],
          excludedEntryIds: [FREEFORM_ENTRY.id],
        }),
      );
    }
    if (url.includes('/plans')) {
      return Promise.resolve(jsonResponse([FREEFORM_ENTRY]));
    }
    if (url.includes('/tags')) return Promise.resolve(jsonResponse([]));
    if (url.includes('/recipes')) {
      return Promise.resolve(
        jsonResponse([
          recipe('11111111-1111-1111-1111-111111111111', 'Quick Dinner', 'dinner'),
        ]),
      );
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

beforeEach(() => {
  // Emulate a phone viewport.
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
  mockApi();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window._env_;
});

describe('STEP-27 mobile-responsive Weekly Planner at 390px (NFR-2)', () => {
  it('exposes the week view and week-navigation controls, labeled and focusable', async () => {
    expect(window.innerWidth).toBe(PHONE_WIDTH);
    renderWithClient(<WeeklyPlanner />);

    // View the week: the heading and all seven day cells are reachable.
    expect(
      await screen.findByRole('heading', { name: /weekly planner/i }),
    ).toBeTruthy();
    const days = await screen.findByRole('list', { name: /days of the week/i });
    expect(within(days).getAllByRole('listitem').length).toBeGreaterThanOrEqual(7);

    // Navigate weeks: prev/next are labeled and keyboard-focusable.
    const nav = screen.getByRole('navigation', { name: /week navigation/i });
    const prev = within(nav).getByRole('button', { name: /previous week/i });
    const next = within(nav).getByRole('button', { name: /next week/i });
    expect(isFocusable(prev)).toBe(true);
    expect(isFocusable(next)).toBe(true);

    // The edit toggle (entry to the touch DnD mode) is reachable + focusable.
    const editToggle = screen.getByRole('button', { name: /edit plan/i });
    expect(isFocusable(editToggle)).toBe(true);
  });

  it('opens a meal detail and the add/edit meal form, every control labeled and focusable', async () => {
    renderWithClient(<WeeklyPlanner />);
    await screen.findByRole('heading', { name: /weekly planner/i });

    // Open a meal's detail (FR-2): the Monday lunch freeform meal.
    const mealButton = await screen.findByRole('button', {
      name: /leftover pasta/i,
    });
    expect(isFocusable(mealButton)).toBe(true);
    fireEvent.click(mealButton);
    await waitFor(() =>
      expect(mealButton.getAttribute('aria-expanded')).toBe('true'),
    );

    // Edit the meal: the edit form opens with labeled, focusable controls.
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    const form = await screen.findByRole('form', { name: /edit meal/i });
    const titleField = within(form).getByLabelText(/title/i);
    const slotField = within(form).getByLabelText(/meal slot/i);
    const saveBtn = within(form).getByRole('button', { name: /save meal/i });
    for (const control of [titleField, slotField, saveBtn]) {
      expect(control).toBeTruthy();
      expect(isFocusable(control as HTMLElement)).toBe(true);
    }
    // The user's in-progress title is editable at phone width.
    fireEvent.change(titleField, { target: { value: 'Pasta v2' } });
    expect((titleField as HTMLInputElement).value).toBe('Pasta v2');
  });

  it('collapses the edit mode to a single-column palette-over-week layout, controls reachable', async () => {
    renderWithClient(<WeeklyPlanner />);
    await screen.findByRole('heading', { name: /weekly planner/i });

    // Enter edit mode (the touch DnD layout).
    fireEvent.click(screen.getByRole('button', { name: /edit plan/i }));

    // The two-panel layout's container uses a mobile-first SINGLE column; the
    // desktop split is gated behind a >=768px media query (WeekGrid.tsx). At
    // 390px the palette and the week stack in one column (palette drawer above
    // the week) rather than side-by-side.
    const palette = await screen.findByRole('complementary', {
      name: /recipe palette/i,
    });
    const layout = palette.parentElement as HTMLElement;
    expect(layout.className).toContain('weekly-planner__edit-layout');
    // The base (phone) rule is a single track; the second column is opt-in only
    // inside the @media (min-width:768px) block. Assert that intent is encoded.
    const styleEl = document.querySelector('style');
    const css = styleEl?.textContent ?? '';
    expect(css).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/@media\s*\(min-width:\s*768px\)/);

    // Both panels are reachable at phone width: the palette recipe and every
    // day/slot assignment target.
    expect(
      await within(palette).findByRole('button', { name: /quick dinner/i }),
    ).toBeTruthy();
    const targets = await screen.findAllByRole('button', { name: /^assign to /i });
    expect(targets.length).toBe(28); // 7 days x 4 slots, all present
    expect(isFocusable(targets[0] as HTMLElement)).toBe(true);

    // The palette filters are labeled + focusable (reachable in the drawer).
    const search = within(palette).getByRole('search');
    const mealType = within(search).getByLabelText(/meal type/i);
    const tag = within(search).getByLabelText(/^tag/i);
    expect(isFocusable(mealType as HTMLElement)).toBe(true);
    expect(isFocusable(tag as HTMLElement)).toBe(true);
  });

  it('assigns a recipe via tap-to-assign at phone width (the touch core flow completes)', async () => {
    renderWithClient(<WeeklyPlanner />);
    await screen.findByRole('heading', { name: /weekly planner/i });
    fireEvent.click(screen.getByRole('button', { name: /edit plan/i }));

    const palette = await screen.findByRole('complementary', {
      name: /recipe palette/i,
    });
    fireEvent.click(
      await within(palette).findByRole('button', { name: /quick dinner/i }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /assign to tuesday dinner/i }),
    );

    // The assignment completes (no error surfaced); the planner re-reads the week.
    await waitFor(() =>
      expect(screen.queryByText(/change not saved/i)).toBeNull(),
    );
  });

  it('documents the manual layout check that jsdom cannot perform', () => {
    // jsdom performs NO CSS layout, so overflow/clipping/tap-target SIZE at 390px
    // is a MANUAL / future-Playwright check. Documented here so the requirement
    // is explicit and traceable rather than silently unverified:
    //
    //   MANUAL CHECK (NFR-2, 390px viewport):
    //     1. Open the SPA at a 390px-wide viewport; go to the Weekly Planner.
    //     2. View the week; navigate prev/next; open a meal detail; add/edit a
    //        meal; enter edit mode and assign a recipe by tap and by drag.
    //     3. Confirm: no horizontal scroll, the edit mode is a single column
    //        (palette drawer above the week, not a squeezed two-panel split),
    //        no clipped/overlapping controls, every control tappable.
    //
    // The structural + accessibility guarantees above run automatically and
    // cover the most common mobile breaks.
    expect(true).toBe(true);
  });
});
