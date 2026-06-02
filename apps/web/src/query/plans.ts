import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  PlanEntry,
  PlanEntryInput,
  WeeklySummary,
} from '@meal-tracking/shared';
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

/** Direction of a week navigation step. */
export type WeekDirection = 'prev' | 'next';

/**
 * The Monday DATE (YYYY-MM-DD) of the week containing `isoDate`, computed at UTC
 * so it is timezone-independent and matches the server's normalization (AD-2).
 */
function mondayOf(isoDate: string): Date {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  const dow = d.getUTCDay(); // 0=Sunday..6=Saturday
  const daysSinceMonday = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}

/**
 * Shift a week's Monday DATE by exactly +/- 7 days for back/forward navigation
 * (AD-2, F-11, S-4). The input is first normalized to its week's Monday, then 7
 * days are added or subtracted by pure DATE arithmetic at UTC — never ISO
 * week-number (YYYY-Www) math, which mis-handles the 52/53-week year boundary
 * (the prototype's bug, F-11). Returns the adjacent Monday as YYYY-MM-DD.
 */
export function shiftWeek(weekStart: string, direction: WeekDirection): string {
  const monday = mondayOf(weekStart);
  monday.setUTCDate(monday.getUTCDate() + (direction === 'next' ? 7 : -7));
  return monday.toISOString().slice(0, 10);
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
 * Query key for a week's nutrition summary: `['plan-summary', weekStart]`. It
 * shares neither the `['plan', ...]` prefix nor invalidation, but a plan write
 * invalidates `['plan']` AND `['plan-summary']` (see {@link useSavePlanEntry})
 * so the summary recomputes after meals change.
 */
export function weeklySummaryQueryKey(
  weekStart: string,
): readonly ['plan-summary', string] {
  return ['plan-summary', weekStart] as const;
}

/** Fetch the week's macros summary from GET /plans/summary?weekStart=. */
async function fetchWeeklySummary(weekStart: string): Promise<WeeklySummary> {
  const params = new URLSearchParams({ weekStart });
  return apiFetch<WeeklySummary>(`/api/v1/plans/summary?${params.toString()}`);
}

/**
 * Query hook for a week's nutrition summary (FR-5, AD-6). The server aggregates
 * MACROS ONLY across the week's recipe-based entries via the shared engine on
 * unrounded per-serving values (AC-5.1); freeform meals and recipe tombstones
 * are reported in `excludedEntryIds` so the UI can state what is not counted
 * (AC-5.2). Keyed by the week's Monday DATE, like the plan query, so navigating
 * back to a week reuses its cached summary (AD-4).
 */
export function useWeeklySummary(
  weekStart: string,
): UseQueryResult<WeeklySummary, Error> {
  return useQuery({
    queryKey: weeklySummaryQueryKey(weekStart),
    queryFn: () => fetchWeeklySummary(weekStart),
  });
}

/** Per-day macro totals returned by GET /plans/daily-summary. */
export interface DayNutrition {
  dayOfWeek: number; // 0 = Monday, 6 = Sunday
  hasData: boolean;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

async function fetchDailyNutrition(weekStart: string): Promise<DayNutrition[]> {
  const params = new URLSearchParams({ weekStart });
  return apiFetch<DayNutrition[]>(`/api/v1/plans/daily-summary?${params.toString()}`);
}

/** Query hook for per-day macro breakdown (GET /plans/daily-summary). */
export function useDailyNutrition(
  weekStart: string,
): UseQueryResult<DayNutrition[], Error> {
  return useQuery({
    queryKey: ['plan-daily-summary', weekStart] as const,
    queryFn: () => fetchDailyNutrition(weekStart),
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
      // Invalidate the week's plan AND its nutrition summary so the macro totals
      // recompute after a meal is added/edited (FR-5). The two keys do not share
      // a prefix, so both are invalidated explicitly.
      void queryClient.invalidateQueries({ queryKey: ['plan'] });
      void queryClient.invalidateQueries({ queryKey: ['plan-summary'] });
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
      void queryClient.invalidateQueries({ queryKey: ['plan-summary'] });
    },
  });
}
