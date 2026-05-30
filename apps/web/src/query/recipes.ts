import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Recipe } from '@meal-tracking/shared';
import { apiFetch } from '../api/client.js';

/**
 * Recipe server state via TanStack Query (AD-5). Caching, loading, and error
 * handling come for free; the recipe list is keyed for later filter/search
 * reuse (Bundle 5) rather than a one-off fetch.
 */

/**
 * Filters the recipe list query accepts. Bundle 1 has none; the shape exists so
 * the query key can carry q/mealType/tag in Bundle 5 without a rewrite (AD-6).
 */
export interface RecipeFilters {
  q?: string;
  mealType?: string;
  tag?: string;
}

/**
 * Structured query key for the recipe list. `['recipes', filters]` lets Bundle
 * 5 add filter/search by extending `filters`; a different filter set is a
 * distinct cache entry, and a write can invalidate `['recipes']` wholesale.
 */
export function recipesQueryKey(
  filters: RecipeFilters = {},
): readonly ['recipes', RecipeFilters] {
  return ['recipes', filters] as const;
}

/** Fetch the workspace's recipes from GET /recipes through the platform client. */
async function fetchRecipes(filters: RecipeFilters): Promise<Recipe[]> {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.mealType) params.set('mealType', filters.mealType);
  if (filters.tag) params.set('tag', filters.tag);
  const query = params.toString();
  return apiFetch<Recipe[]>(`/api/v1/recipes${query ? `?${query}` : ''}`);
}

/**
 * Query hook for the recipe list. Uses the structured key so filter/search can
 * extend it later (AD-5, Bundle 5).
 */
export function useRecipes(
  filters: RecipeFilters = {},
): UseQueryResult<Recipe[], Error> {
  return useQuery({
    queryKey: recipesQueryKey(filters),
    queryFn: () => fetchRecipes(filters),
  });
}
