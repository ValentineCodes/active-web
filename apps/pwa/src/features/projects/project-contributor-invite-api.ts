import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { USERNAME_MIN_LENGTH } from '@/features/profile/username';
import { parseSearchPeopleRows } from '@/features/search/discovery-types';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

const SEARCH_PEOPLE_LIMIT = 20;

export function peopleSearchQueryMeetsMinLength(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  const term = trimmed.startsWith('@') ? trimmed.slice(1).trim() : trimmed;
  return term.length >= USERNAME_MIN_LENGTH;
}

export async function searchPeople(query: string, offset = 0) {
  const trimmed = query.trim();
  if (!peopleSearchQueryMeetsMinLength(trimmed)) return [];

  const { data, error } = await supabase.rpc('search_people', {
    p_query: trimmed,
    p_limit: SEARCH_PEOPLE_LIMIT,
    p_offset: offset,
  });

  if (error) throw error;
  return parseSearchPeopleRows(data ?? []);
}

export function useSearchPeople(query: string, enabled: boolean) {
  const trimmed = query.trim();

  return useQuery({
    queryKey: queryKeys.searchPeople(trimmed),
    queryFn: () => searchPeople(trimmed),
    enabled: enabled && peopleSearchQueryMeetsMinLength(trimmed),
  });
}

export function useProjectContributorInvitations(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.projectContributorInvitations(projectId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_project_contributor_invitations', {
        p_project_id: projectId,
      });
      if (error) throw error;
      return (data ?? []).map((row: { invitee_id: string }) => row.invitee_id);
    },
    enabled: enabled && Boolean(projectId),
  });
}

export function useInviteProjectContributor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { projectId: string; inviteeId: string }) => {
      const { data, error } = await supabase.rpc('invite_project_contributor', {
        p_project_id: input.projectId,
        p_invitee_id: input.inviteeId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, input) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projectContributorInvitations(input.projectId),
      });
    },
  });
}