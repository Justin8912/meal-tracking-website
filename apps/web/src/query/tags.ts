import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query';
import type { Tag } from '@meal-tracking/shared';
import { apiFetch } from '../api/client.js';

/**
 * Workspace tags for the library filter (STEP-41, FR-5, AD-5). The tag list
 * drives the filter control; selecting one sets `tag` in the recipes query key
 * so the server-filtered list refetches (AC-5.2).
 */
export function tagsQueryKey(): readonly ['tags'] {
  return ['tags'] as const;
}

async function fetchTags(): Promise<Tag[]> {
  return apiFetch<Tag[]>('/api/v1/tags');
}

/** Query hook for the workspace's tags. */
export function useTags(): UseQueryResult<Tag[], Error> {
  return useQuery({ queryKey: tagsQueryKey(), queryFn: fetchTags });
}

async function deleteTag(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/tags/${id}`, { method: 'DELETE' });
}

/** Mutation: permanently delete a tag from the workspace (removes it from all recipes). */
export function useDeleteTag(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTag,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tagsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}
