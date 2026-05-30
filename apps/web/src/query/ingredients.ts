import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Micronutrient, Nutrition } from '@meal-tracking/shared';
import { apiFetch } from '../api/client.js';

/**
 * Ingredient server state for the picker (STEP-39, FR-2/FR-3, AD-3/AD-4).
 *
 * USDA search is a debounced TanStack Query against the API proxy (the key
 * never reaches the browser, AC-2.4); selecting a result snapshots it into an
 * owned ingredient (POST /ingredients/usda/:fdcId) and creating a custom
 * ingredient posts to /ingredients. Both saves return the persisted ingredient
 * (id + reference-grams basis nutrition + conversion data) which the editor
 * feeds to the shared engine for live nutrition (AC-4.4). Validation against
 * the shared schemas happens server-side (S-3).
 */

/** A normalized USDA search result item (contracts.md). Macros are optional. */
export interface UsdaSearchItem {
  fdcId: string;
  description: string;
  dataType: string;
  per100g: {
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    fiberG?: number;
    micronutrients: Record<string, Micronutrient>;
  };
}

/** A persisted ingredient (custom or USDA snapshot) as returned by the API. */
export interface SavedIngredient {
  id: string;
  name: string;
  source: 'usda' | 'custom';
  fdcId: string | null;
  referenceGrams: number;
  gramWeightPerQty: number | null;
  unitGramEquivalents: Record<string, number>;
  nutrition: {
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    fiberG?: number;
    micronutrients: Record<string, Micronutrient>;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Build a full-precision engine Nutrition from an API per-reference-grams
 * profile. Absent macros are not known; the engine's arithmetic needs numbers,
 * so they read as 0 here — the editor surfaces incompleteness via the engine's
 * completeness flag and never rounds/zero-fills at display (S-6).
 */
export function toEngineNutrition(profile: SavedIngredient['nutrition']): Nutrition {
  return {
    calories: profile.calories ?? 0,
    proteinG: profile.proteinG ?? 0,
    carbsG: profile.carbsG ?? 0,
    fatG: profile.fatG ?? 0,
    fiberG: profile.fiberG ?? 0,
    micronutrients: profile.micronutrients,
  };
}

/** Query key for a USDA search; a distinct query per search term. */
export function ingredientSearchKey(q: string): readonly ['ingredient-search', string] {
  return ['ingredient-search', q] as const;
}

async function searchIngredients(q: string): Promise<UsdaSearchItem[]> {
  return apiFetch<UsdaSearchItem[]>(
    `/api/v1/ingredients/search?q=${encodeURIComponent(q)}`,
  );
}

/**
 * Debounced USDA search. `q` is the already-debounced term; the query is
 * disabled until there is a term so an empty box never hits the API.
 */
export function useIngredientSearch(
  q: string,
): UseQueryResult<UsdaSearchItem[], Error> {
  return useQuery({
    queryKey: ingredientSearchKey(q),
    queryFn: () => searchIngredients(q),
    enabled: q.trim().length > 0,
  });
}

/** Confirmed gram-equivalents the user supplies when snapshotting a USDA food. */
export interface UsdaSnapshotArgs {
  fdcId: string;
  gramWeightPerQty?: number;
  unitGramEquivalents?: Record<string, number>;
}

async function snapshotUsda(args: UsdaSnapshotArgs): Promise<SavedIngredient> {
  const { fdcId, ...body } = args;
  return apiFetch<SavedIngredient>(`/api/v1/ingredients/usda/${fdcId}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Mutation: snapshot a USDA food into an owned ingredient (AD-4, F-11). */
export function useSnapshotUsdaIngredient(): UseMutationResult<
  SavedIngredient,
  Error,
  UsdaSnapshotArgs
> {
  return useMutation({ mutationFn: snapshotUsda });
}

/** POST /ingredients body for a custom ingredient (FR-3). */
export interface CustomIngredientInput {
  name: string;
  referenceGrams?: number;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  micronutrients?: Record<string, Micronutrient>;
  gramWeightPerQty?: number;
  unitGramEquivalents?: Record<string, number>;
}

async function createCustomIngredient(
  input: CustomIngredientInput,
): Promise<SavedIngredient> {
  return apiFetch<SavedIngredient>('/api/v1/ingredients', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Mutation: create a custom ingredient (FR-3, AC-3.1). */
export function useCreateCustomIngredient(): UseMutationResult<
  SavedIngredient,
  Error,
  CustomIngredientInput
> {
  return useMutation({ mutationFn: createCustomIngredient });
}
