import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Micronutrient, Nutrition } from '@meal-tracking/shared';
import type { MacroKey } from '@meal-tracking/nutrition-engine';
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
  preferredUnit: string;
  notes: string | null;
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
 * so they read as 0 here. That 0 is NOT a claim the value is zero — `absentMacros`
 * (see {@link absentMacrosOf}) records which macros the API omitted so the engine
 * flags the line `missing-macros` via completeness rather than silently treating
 * the placeholder 0 as a real total (the Bundle 5 limitation; F-5, S-6). The
 * editor surfaces that incompleteness and never rounds/zero-fills at display.
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

/**
 * Which macros the API did NOT provide for this ingredient (absent = unknown,
 * not zero — S-6). The API returns macro fields only when known
 * (toIngredientResponse omits NULL columns), so an `undefined` field here means
 * the source never reported it. The engine consumes this to flag the line
 * `missing-macros` instead of letting the placeholder 0 read as a real total.
 */
export function absentMacrosOf(
  profile: SavedIngredient['nutrition'],
): MacroKey[] {
  const absent: MacroKey[] = [];
  if (profile.calories === undefined) absent.push('calories');
  if (profile.proteinG === undefined) absent.push('proteinG');
  if (profile.carbsG === undefined) absent.push('carbsG');
  if (profile.fatG === undefined) absent.push('fatG');
  if (profile.fiberG === undefined) absent.push('fiberG');
  return absent;
}

/** Query key for a USDA search; a distinct query per search term. */
export function ingredientSearchKey(q: string): readonly ['ingredient-search', string] {
  return ['ingredient-search', q] as const;
}

/** Query key for the workspace's owned ingredient list. */
export function ingredientsQueryKey(): readonly ['ingredients'] {
  return ['ingredients'] as const;
}

/** Fetch the workspace's owned ingredients (per-referenceGrams nutrition + conversions). */
async function fetchIngredients(): Promise<SavedIngredient[]> {
  return apiFetch<SavedIngredient[]>('/api/v1/ingredients');
}

/**
 * Query hook for the workspace's owned ingredients (GET /ingredients). Each row
 * carries the per-`referenceGrams` nutrition and conversion data the shared
 * engine needs. The recipe-detail endpoint carries only usage (ingredientId/
 * quantity/unit); joining that to this list reproduces a recipe's nutrition
 * client-side without a new endpoint (the canonical reload flow, AD-4).
 */
export function useIngredients(): UseQueryResult<SavedIngredient[], Error> {
  return useQuery({
    queryKey: ingredientsQueryKey(),
    queryFn: fetchIngredients,
  });
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
  preferredUnit: string;
  notes?: string | null;
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCustomIngredient,
    onSuccess: () => {
      // Invalidate the saved-ingredients list so the new item appears in search.
      void queryClient.invalidateQueries({ queryKey: ['ingredients'] });
    },
  });
}

/** Delete a custom ingredient (DELETE /ingredients/:id). Only source='custom' items. */
async function deleteIngredient(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/ingredients/${id}`, { method: 'DELETE' });
}

/** Mutation: permanently delete a custom ingredient from the workspace. */
export function useDeleteIngredient(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteIngredient,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ingredients'] });
    },
  });
}

async function updateIngredientNote(args: { id: string; notes: string | null }): Promise<SavedIngredient> {
  return apiFetch<SavedIngredient>(`/api/v1/ingredients/${args.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ notes: args.notes }),
  });
}

/** Mutation: update the notes field on an existing ingredient (PATCH /ingredients/:id). */
export function useUpdateIngredientNote(): UseMutationResult<
  SavedIngredient,
  Error,
  { id: string; notes: string | null }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateIngredientNote,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ingredients'] });
    },
  });
}
