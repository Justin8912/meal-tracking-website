import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { PlanEntry, PlanEntryInput } from '@meal-tracking/shared';
import { apiFetch } from '../api/client.js';

/**
 * Weekly-plan server state via TanStack Query (AD-4). Caching, loading, and
 * error handling come for free; the week's plan is keyed by its Monday DATE so
 * back/forward navigation (Bundle 3) renders instantly from cache rather than
 * refetching, and a write can invalidate `['plan']` wholesale (NFR-1).
 */

/**
 * The query key for a week's plan: `['plan', weekStart]`. `weekStart` is the
 * Monday DATE of the week (AD-2). A distinct week is a distinct cache entry, so
 * navigating to a previously-viewed week reuses its cached data (Bundle 3).
 */
export function planQueryKey(weekStart: string): readonly ['plan', string] {
  return ['plan', weekStart] as const;
}

/** Fetch the week's plan entries from GET /plans?weekStart= via the platform client. */
async function fetchWeekPlan(weekStart: string): Promise<PlanEntry[]> {
  const params = new URLSearchParams({ weekStart });
  return apiFetch<PlanEntry[]>(`/api/v1/plans?${params.toString()}`);
}

/**
 * Query hook for a week's plan, keyed by the week's Monday DATE (AD-4). The
 * server normalizes weekStart to the Monday, so callers may pass any in-week
 * date; the cache key uses whatever is passed, so callers should pass the
 * normalized Monday for stable cache reuse.
 */
export function useWeekPlan(
  weekStart: string,
): UseQueryResult<PlanEntry[], Error> {
  return useQuery({
    queryKey: planQueryKey(weekStart),
    queryFn: () => fetchWeekPlan(weekStart),
  });
}

/**
 * Persist a plan entry. A `planEntryId` routes to PUT /plans/:id (edit),
 * otherwise POST /plans (add). The body is the shared PlanEntryInput contract
 * incl. the recipe/freeform XOR (S-1); the server normalizes weekStart to the
 * Monday and re-validates the XOR.
 */
async function savePlanEntry(
  input: PlanEntryInput,
  planEntryId?: string,
): Promise<PlanEntry> {
  const path = planEntryId ? `/api/v1/plans/${planEntryId}` : '/api/v1/plans';
  return apiFetch<PlanEntry>(path, {
    method: planEntryId ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  });
}

/** Arguments accepted by the save mutation (add vs edit by `planEntryId`). */
export interface SavePlanEntryArgs {
  input: PlanEntryInput;
  planEntryId?: string;
}

/**
 * Mutation hook to add/edit a plan entry (AD-4, F-4). On success it invalidates
 * every `['plan', ...]` query so the affected week refetches and the new/edited
 * meal appears (AC-1.3/AC-1.4) regardless of which week is active. On error the
 * mutation's `error` is surfaced by the caller as a clear "not saved" message
 * (AC-1.6); the caller keeps the in-progress entry so nothing is silently lost.
 */
export function useSavePlanEntry(): UseMutationResult<
  PlanEntry,
  Error,
  SavePlanEntryArgs
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, planEntryId }: SavePlanEntryArgs) =>
      savePlanEntry(input, planEntryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plan'] });
    },
  });
}

/** Remove a plan entry via DELETE /plans/:id. */
async function deletePlanEntry(planEntryId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/plans/${planEntryId}`, { method: 'DELETE' });
}

/**
 * Mutation hook to remove a plan entry (AD-4, AC-1.4). On success it
 * invalidates every `['plan', ...]` query so the week refetches without the
 * removed meal. A delete failure surfaces via the mutation's `error` (AC-1.6).
 */
export function useDeletePlanEntry(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planEntryId: string) => deletePlanEntry(planEntryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plan'] });
    },
  });
}
