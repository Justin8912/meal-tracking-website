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
 * STEP-19 (test-first for STEP-20): assigning a recipe to a day/slot.
 *
 * AC-4.3/AC-4.4 are the highest-risk piece (HTML5 DnD fails on touch, F-2; a
 * touch-drag can be mistaken for a scroll). True pointer/touch drag is not
 * reliably simulable in jsdom and Playwright is sandbox-blocked, so the
 * DETERMINISTIC contract verified here is:
 *   - tap-to-assign fallback: tapping a recipe SELECTS it, then tapping a
 *     day/slot target ASSIGNS it via POST /plans {recipeId} for that exact
 *     day/slot (AC-4.4, NFR-2) — the path touch users actually take;
 *   - the assignment body is a recipe-only PlanEntryInput (recipeId set, no
 *     freeform fields) for the tapped day's dayOfWeek and slot.
 * The live pointer/keyboard DRAG gesture is wired in STEP-20 and asserted
 * structurally; the raw gesture is a documented manual/Playwright check.
 *
 * Fails before STEP-20 (no draggable cards / droppable day-slot targets / tap
 * selection). Fetch is mocked.
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface PostCall {
  url: string;
  body: unknown;
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
            dayOfWeek: 0,
            mealSlot: 'breakfast',
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
    if (url.includes('/plans')) {
      return Promise.resolve(jsonResponse([]));
    }
    if (url.includes('/tags')) {
      return Promise.resolve(jsonResponse([]));
    }
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

async function enterEditMode(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: /edit plan/i }));
  return screen.findByRole('complementary', { name: /recipe palette/i });
}

describe('WeeklyPlanner assignment (tap-to-assign fallback)', () => {
  it('tapping a recipe then a day/slot assigns it via POST /plans {recipeId} for that day/slot', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    const posts: PostCall[] = [];
    mockApi(posts);

    renderWithClient(<WeeklyPlanner />);
    const palette = await enterEditMode();

    // Tap the recipe card to SELECT it for assignment.
    const card = await within(palette).findByRole('button', {
      name: /quick dinner/i,
    });
    fireEvent.click(card);

    // It is marked selected (so touch users see what they picked).
    await waitFor(() => expect(card.getAttribute('aria-pressed')).toBe('true'));

    // Tap a specific day/slot target to PLACE it. Tuesday (dayOfWeek 1) dinner.
    const target = await screen.findByRole('button', {
      name: /assign to tuesday dinner/i,
    });
    fireEvent.click(target);

    await waitFor(() => expect(posts.length).toBe(1));
    const post = posts[0];
    expect(post).toBeTruthy();
    expect(post?.body).toMatchObject({
      dayOfWeek: 1,
      mealSlot: 'dinner',
      recipeId: '11111111-1111-1111-1111-111111111111',
    });
    // Recipe-only entry: no freeform fields (XOR, S-1).
    expect((post?.body as Record<string, unknown>).freeformTitle).toBeUndefined();
  });

  it('does not assign on a day/slot tap when no recipe is selected', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    const posts: PostCall[] = [];
    mockApi(posts);

    renderWithClient(<WeeklyPlanner />);
    await enterEditMode();

    const target = await screen.findByRole('button', {
      name: /assign to monday breakfast/i,
    });
    fireEvent.click(target);

    // Nothing selected -> no assignment fired.
    await new Promise((r) => setTimeout(r, 20));
    expect(posts.length).toBe(0);
  });

  it('exposes day/slot drop targets for every day and meal slot', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    mockApi([]);

    renderWithClient(<WeeklyPlanner />);
    await enterEditMode();

    // 7 days x 4 slots = 28 assignment targets.
    const targets = await screen.findAllByRole('button', {
      name: /^assign to /i,
    });
    expect(targets.length).toBe(28);
  });
});
