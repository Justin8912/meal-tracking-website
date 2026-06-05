import { describe, it, expect } from 'vitest';
import { recipesQueryKey } from './recipes.js';

/**
 * STEP-7 verify (2nd clause): the recipe list query must use a STRUCTURED key
 * so Bundle 5 can extend it for filter/search reuse rather than a one-off
 * fetch (AD-5). A distinct filter set must produce a distinct key (a separate
 * cache entry), and all recipe queries must share the 'recipes' prefix so a
 * write can invalidate them wholesale.
 */
describe('recipesQueryKey', () => {
  it('is prefixed with "recipes" and carries the filters object', () => {
    expect(recipesQueryKey()).toEqual(['recipes', {}]);
    expect(recipesQueryKey({ mealType: 'breakfast' })).toEqual([
      'recipes',
      { mealType: 'breakfast' },
    ]);
  });

  it('produces distinct keys for distinct filters but a shared prefix', () => {
    const a = recipesQueryKey({ q: 'oat' });
    const b = recipesQueryKey({ q: 'rice' });
    expect(a[0]).toBe('recipes');
    expect(b[0]).toBe('recipes');
    expect(a).not.toEqual(b);
  });
});
