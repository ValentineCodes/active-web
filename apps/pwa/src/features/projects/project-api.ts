import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { DESCRIPTION_LIMITS, TITLE_LIMITS } from '@/config';
import { localDateIso, localTimeIso, REQUEST_EXPIRY_TIMEZONE } from '@/features/requests/request-expiry-core';
import { resolveRequestTagIdsForRpc, type RequestTag } from '@/features/requests/tags';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

type FundingVisibility = Database['public']['Enums']['project_funding_visibility'];

export function useMyEntitlements() {
  return useQuery({
    queryKey: queryKeys.myEntitlements,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_entitlements');
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      title: string;
      description: string;
      budgetTotalMajor: number;
      minFundingTargetMajor: number;
      minContributionMajor: number;
      fundingDeadlineDate: Date;
      fundingDeadlineTime?: Date | null;
      fundingVisibility: FundingVisibility;
      tags: RequestTag[];
      attachmentPath?: string | null;
    }) => {
      const trimmedDescription = input.description.trim();
      if (trimmedDescription.length > DESCRIPTION_LIMITS.max) {
        throw new Error('Description is too long.');
      }
      if (
        input.title.trim().length < TITLE_LIMITS.min ||
        input.title.trim().length > TITLE_LIMITS.max
      ) {
        throw new Error('Enter a valid project title.');
      }

      const tagIds = await resolveRequestTagIdsForRpc(
        input.tags.map((tag) => ({ slug: tag.slug })),
      );

      const { data, error } = await supabase.rpc('create_project', {
        p_title: input.title.trim(),
        p_description: trimmedDescription,
        p_budget_total_major: input.budgetTotalMajor,
        p_min_funding_target_major: input.minFundingTargetMajor,
        p_min_contribution_major: input.minContributionMajor,
        p_funding_deadline_local_date: localDateIso(input.fundingDeadlineDate),
        p_funding_timezone: REQUEST_EXPIRY_TIMEZONE,
        p_funding_deadline_local_time: input.fundingDeadlineTime
          ? localTimeIso(input.fundingDeadlineTime)
          : undefined,
        p_funding_visibility: input.fundingVisibility,
        p_tag_ids: tagIds,
        p_attachment_path: input.attachmentPath || undefined,
      });

      if (error) throw error;
      const projectId = data as string;
      try {
        const detail = await fetchProject(projectId);
        if (detail) {
          queryClient.setQueryData(queryKeys.project(projectId), detail);
        }
      } catch {
        // Detail screen will refetch if prefetch fails.
      }
      return projectId;
    },
    onSuccess: (projectId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myCreatedProjects });
      void queryClient.invalidateQueries({ queryKey: queryKeys.browseOpenProjectsAll });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myEntitlements });
    },
  });
}

export function useOpenProjectFunding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase.rpc('open_project_funding', { p_project_id: projectId });
      if (error) throw error;
    },
    onSuccess: (_void, projectId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myCreatedProjects });
    },
  });
}

export function useStartPremiumTrial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('start_premium_trial');
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.myEntitlements });
    },
  });
}

async function fetchProject(projectId: string) {
  const { data, error } = await supabase.rpc('get_project', { p_project_id: projectId });
  if (error) throw error;
  return data?.[0] ?? null;
}

export function useProject(projectId: string | undefined) {
  const id = projectId?.trim() ?? '';
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => fetchProject(id),
    enabled: id.length > 0,
  });
}

type MyCreatedProjectRow = {
  project_id: string;
  title: string;
  status: string;
  funding_status: string;
  budget_total_kobo: number;
  contributed_total_kobo: number;
};

export function useMyCreatedProjects() {
  return useQuery({
    queryKey: queryKeys.myCreatedProjects,
    queryFn: async (): Promise<MyCreatedProjectRow[]> => {
      const { data, error } = await supabase.rpc('list_my_created_projects', {
        p_limit: 50,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as MyCreatedProjectRow[];
    },
  });
}