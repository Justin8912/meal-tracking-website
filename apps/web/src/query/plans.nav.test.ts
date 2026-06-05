import { describe, it, expect } from 'vitest';
import { shiftWeek } from './plans.js';

/**
 * STEP-11 (test-first for STEP-12): the central risk is the week-boundary bug
 * (F-11). Navigation must shift the active weekStart by EXACTLY +/- 7 days from
 * the current Monday using date arithmetic on the Monday DATE (AD-2, S-4),
 * never ISO week-number math, which breaks across the 52/53-week year boundary.
 *
 * These assertions pin shiftWeek(monday, dir):
 *   * "prev" yields Monday - 7 days; "next" yields Monday + 7 days.
 *   * It is correct across a year boundary: the week of 2025-12-29 (a Monday)
 *     -> next is 2026-01-05, and the week of 2026-01-05 -> prev is 2025-12-29.
 *     Naive YYYY-Www math lands on the wrong year/Monday here (F-11).
 *   * It is correct across a month boundary (e.g. 2026-06-29 -> 2026-07-06).
 * shiftWeek does not exist before STEP-12, so this file fails to import first.
 */
describe('shiftWeek (week navigation by Monday DATE, F-11/S-4)', () => {
  it('prev yields the Monday 7 days earlier', () => {
    expect(shiftWeek('2026-06-08', 'prev')).toBe('2026-06-01');
  });

  it('next yields the Monday 7 days later', () => {
    expect(shiftWeek('2026-06-01', 'next')).toBe('2026-06-08');
  });

  it('crosses a year boundary forward without an ISO-week bug', () => {
    // Monday 2025-12-29 is in ISO week 1 of 2026 by some libraries; date math
    // must simply add 7 days -> 2026-01-05 (the next Monday).
    expect(shiftWeek('2025-12-29', 'next')).toBe('2026-01-05');
  });

  it('crosses a year boundary backward without an ISO-week bug', () => {
    expect(shiftWeek('2026-01-05', 'prev')).toBe('2025-12-29');
  });

  it('crosses a month boundary forward', () => {
    expect(shiftWeek('2026-06-29', 'next')).toBe('2026-07-06');
  });

  it('normalizes a mid-week input to that week before shifting', () => {
    // Wednesday 2026-06-03 is in the week of Monday 2026-06-01; next -> 06-08.
    expect(shiftWeek('2026-06-03', 'next')).toBe('2026-06-08');
  });
});
