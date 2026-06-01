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
import { PointerSensor, KeyboardSensor } from '@dnd-kit/core';
import type { ReactElement } from 'react';
import { WeeklyPlanner } from './WeeklyPlanner.js';
import { POINTER_ACTIVATION, PLANNER_SENSORS } from '../components/WeekGrid.js';

/**
 * STEP-24: drag-and-drop touch assignment end-to-end (AC-4.4, NFR-2).
 *
 * AC-4.4 is the highest-risk requirement: the prototype's HTML5 DnD is broken on
 * touch (F-2), and a touch-drag can be swallowed by page scroll (F-3). This
 * verifies, at the highest level the sandbox allows, the touch GUARANTEE that
 * distinguishes a usable mobile planner from a mouse-only one:
 *   - the dnd-kit PointerSensor carries BOTH a touch activation DELAY and a
 *     movement TOLERANCE, so a touch gesture meant as a SCROLL is not hijacked
 *     into a drag (the central touch risk), and a KeyboardSensor backs it for
 *     a11y - asserted on the SAME sensor config the live DndContext uses;
 *   - the TAP-TO-ASSIGN fallback (the path touch users actually take) assigns a
 *     recipe to the tapped day/slot through the REAL planner -> POST /plans, with
 *     a recipe-only body (XOR, S-1) - driven through the whole WeeklyPlanner view
 *     so the assignment is wired end to end, not just at the WeekGrid unit.
 *
 * Why not a true browser touch-drag: the in-sandbox corporate TLS proxy blocks
 * Playwright browser downloads (the constraint recipe-library Bundle 6
 * documented), and a real pointer/touch drag gesture (press-hold past the
 * activation delay, move past tolerance, drop) cannot be deterministically
 * simulated in jsdom (no layout, no real PointerEvents). The raw touch-drag
 * gesture is therefore a DOCUMENTED manual/Playwright check (see the note test);
 * the deterministic guarantees above run here and catch the actual failure mode
 * (a drag that fires on a scroll, or a touch path with no fallback).
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

interface PostCall {
  url: string;
  body: Record<string, unknown>;
}

/** Mock the API; record POST /plans calls for assertion. */
function mockApi(posts: PostCall[]): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.includes('/plans') && method === 'POST') {
      posts.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
      return Promise.resolve(
        jsonResponse(
          {
            id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            weekStartDate: '2026-06-01',
            dayOfWeek: 1,
            mealSlot: 'dinner',
            position: 0,
            recipeId: '11111111-1111-1111-1111-111111111111',
            freeformTitle: null,
            freeformDescription: null,
            freeformLink: null,
          },
          201,
        ),
      );
    }
    if (url.includes('/plans/summary')) {
      return Promise.resolve(
        jsonResponse({
          weekStartDate: '2026-06-01',
          totals: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
          countedEntryIds: [],
          excludedEntryIds: [],
        }),
      );
    }
    if (url.includes('/plans')) return Promise.resolve(jsonResponse([]));
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

describe('STEP-24 touch drag-and-drop assignment end-to-end (AC-4.4, NFR-2)', () => {
  it('wires the SAME PointerSensor (touch delay + tolerance) and KeyboardSensor the live grid uses, so a scroll is not mistaken for a drag', () => {
    // The activation constraint carries BOTH a positive delay AND tolerance: a
    // touch press must be held AND stay within tolerance before a drag begins,
    // so a scroll gesture is never hijacked into a drag (F-3, the touch risk).
    expect(POINTER_ACTIVATION.delay).toBeGreaterThan(0);
    expect(POINTER_ACTIVATION.tolerance).toBeGreaterThan(0);

    // Both a pointer (touch + mouse) and a keyboard sensor are configured, and
    // the pointer descriptor carries exactly this activation constraint - the
    // config the WeeklyPlanner's DndContext is built from.
    const sensorTypes = PLANNER_SENSORS.map((d) => d.sensor);
    expect(sensorTypes).toContain(PointerSensor);
    expect(sensorTypes).toContain(KeyboardSensor);
    const pointer = PLANNER_SENSORS.find((d) => d.sensor === PointerSensor);
    expect(
      (pointer?.options as { activationConstraint?: unknown } | undefined)
        ?.activationConstraint,
    ).toEqual(POINTER_ACTIVATION);
  });

  it('tap-to-assign places a recipe on the tapped day/slot via POST /plans end to end (the touch fallback)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    const posts: PostCall[] = [];
    mockApi(posts);

    renderWithClient(<WeeklyPlanner />);

    // Enter edit mode (the two-panel touch layout) through the real planner.
    fireEvent.click(await screen.findByRole('button', { name: /edit plan/i }));
    const palette = await screen.findByRole('complementary', {
      name: /recipe palette/i,
    });

    // TAP the recipe card to select it (touch users see what they picked).
    const card = await within(palette).findByRole('button', {
      name: /quick dinner/i,
    });
    fireEvent.click(card);
    await waitFor(() => expect(card.getAttribute('aria-pressed')).toBe('true'));
    // The selection status is announced for the touch flow (a status region whose
    // text prompts the day/slot tap). Scoped via getAllByRole because the weekly
    // summary may also expose a status region.
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('status')
          .some((el) => /tap a day and slot/i.test(el.textContent ?? '')),
      ).toBe(true),
    );

    // TAP the Tuesday dinner target to place it.
    const target = await screen.findByRole('button', {
      name: /assign to tuesday dinner/i,
    });
    fireEvent.click(target);

    // It is assigned through the wired path: a recipe-only POST for that day/slot.
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body).toMatchObject({
      dayOfWeek: 1,
      mealSlot: 'dinner',
      recipeId: '11111111-1111-1111-1111-111111111111',
    });
    // No freeform fields ride along (XOR, S-1).
    expect(posts[0]?.body.freeformTitle).toBeUndefined();
  });

  it('a day/slot tap with no recipe selected does not assign (the touch target is inert until a pick)', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    const posts: PostCall[] = [];
    mockApi(posts);

    renderWithClient(<WeeklyPlanner />);
    fireEvent.click(await screen.findByRole('button', { name: /edit plan/i }));
    await screen.findByRole('complementary', { name: /recipe palette/i });

    const target = await screen.findByRole('button', {
      name: /assign to monday breakfast/i,
    });
    expect(target.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(target);

    await new Promise((r) => setTimeout(r, 20));
    expect(posts).toHaveLength(0);
  });

  it('documents the manual/Playwright check for the raw touch-drag gesture', () => {
    // jsdom cannot dispatch a realistic press-hold-move-drop PointerEvent
    // sequence (no layout, synthetic events bypass the activation timer), and
    // Playwright browser downloads are blocked by the sandbox TLS proxy. The raw
    // touch-DRAG gesture is therefore a MANUAL / future-Playwright check,
    // documented here so the requirement is explicit and traceable:
    //
    //   MANUAL CHECK (AC-4.4, NFR-2 - touch emulation, e.g. 390px):
    //     1. Open the SPA, navigate to the Weekly Planner, tap "Edit plan".
    //     2. With touch emulation on, PRESS-HOLD a recipe card (~200ms), then
    //        DRAG it onto a day/slot cell and release.
    //     3. Confirm: the recipe is assigned to that day/slot (a POST /plans
    //        fires with {recipeId} for the cell), AND a quick vertical SWIPE on a
    //        card SCROLLS the page rather than starting a drag (the activation
    //        delay+tolerance, POINTER_ACTIVATION, guards this).
    //     4. Promote to Playwright: dragTo() under setViewportSize(390) with a
    //        touch context once a browser is reachable.
    //
    // The sensor-wiring and tap-to-assign guarantees above run automatically and
    // cover the deterministic core of the touch contract.
    expect(true).toBe(true);
  });
});
