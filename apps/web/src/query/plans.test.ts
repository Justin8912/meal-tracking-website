import { describe, it, expect } from 'vitest';
import { planQueryKey } from './plans.js';

/**
 * STEP-6 verify (2nd clause): the week-plan query must use a WEEK-KEYED key so
 * Bundle 3 navigation reuses the cache rather than refetching (AD-4). The key is
 * `['plan', weekStart]`, so a different week is a distinct cache entry and all
 * plan queries share the 'plan' prefix for wholesale invalidation on a write.
 */
describe('planQueryKey', () => {
  it('is prefixed with "plan" and carries the weekStart', () => {
    expect(planQueryKey('2026-06-01')).toEqual(['plan', '2026-06-01']);
  });

  it('produces distinct keys for distinct weeks but a shared prefix', () => {
    const a = planQueryKey('2026-06-01');
    const b = planQueryKey('2026-06-08');
    expect(a[0]).toBe('plan');
    expect(b[0]).toBe('plan');
    expect(a).not.toEqual(b);
  });
});
