import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { PlanEntry } from '@meal-tracking/shared';
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
