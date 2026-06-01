import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Recipe, RecipeDetail, RecipeInput } from '@meal-tracking/shared';
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

/**
 * Query key for a single recipe's detail: `['recipe', recipeId]`. Distinct from
 * the list key so a recipe-by-id read (e.g. the planner's planned-meal detail)
 * is cached and deduped independently and shared across views (AD-4/AD-5).
 */
export function recipeDetailQueryKey(
  recipeId: string,
): readonly ['recipe', string] {
  return ['recipe', recipeId] as const;
}

/** Fetch a single recipe's hydrated detail (usage + tags) from GET /recipes/:id. */
async function fetchRecipeDetail(recipeId: string): Promise<RecipeDetail> {
  return apiFetch<RecipeDetail>(`/api/v1/recipes/${recipeId}`);
}

/**
 * Query hook for one recipe's detail (GET /recipes/:id), keyed by id (AD-4). The
 * planner's planned-meal detail composes this recipe usage with the ingredient
 * nutrition (useIngredients) and the shared engine to show a recipe-backed
 * meal's nutrition without duplicating nutrition logic or adding an endpoint
 * (FR-2, AD-4). `enabled` lets the caller skip the fetch for a non-recipe meal.
 */
export function useRecipeDetail(
  recipeId: string | null | undefined,
): UseQueryResult<RecipeDetail, Error> {
  return useQuery({
    queryKey: recipeDetailQueryKey(recipeId ?? ''),
    queryFn: () => fetchRecipeDetail(recipeId as string),
    enabled: recipeId != null && recipeId !== '',
  });
}

/**
 * Persist a recipe. A `recipeId` routes to PUT /recipes/:id (edit), otherwise
 * POST /recipes (create). The body is the shared RecipeInput contract (S-3).
 */
async function saveRecipe(
  input: RecipeInput,
  recipeId?: string,
): Promise<Recipe> {
  const path = recipeId
    ? `/api/v1/recipes/${recipeId}`
    : '/api/v1/recipes';
  return apiFetch<Recipe>(path, {
    method: recipeId ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  });
}

/** Arguments accepted by the save mutation (create vs edit by `recipeId`). */
export interface SaveRecipeArgs {
  input: RecipeInput;
  recipeId?: string;
}

/**
 * Mutation hook to create/update a recipe (AD-5, F-2). On success it
 * invalidates every `['recipes', ...]` query so the library refetches and the
 * new/edited recipe appears (AC-1.1) regardless of the active filter/search.
 */
export function useSaveRecipe(): UseMutationResult<
  Recipe,
  Error,
  SaveRecipeArgs
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, recipeId }: SaveRecipeArgs) =>
      saveRecipe(input, recipeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}
