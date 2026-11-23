import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { DESCRIPTION_LIMITS, TITLE_LIMITS } from '@/config';
import { resolveRequestTagIdsForRpc, type RequestTag } from '@/features/requests/tags';
import { createIdempotencyKey } from '@/lib/idempotency-key';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import {
  localDateIso,
  localTimeIso,
  REQUEST_EXPIRY_TIMEZONE,
} from '@/features/requests/request-expiry';

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
      latitude: number;
      longitude: number;
      locationLabel: string;
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
        p_latitude: input.latitude,
        p_longitude: input.longitude,
        p_location_label: input.locationLabel.trim(),
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.myEntitlements });
      void queryClient.invalidateQueries({ queryKey: queryKeys.browseOpenProjectsAll });
    },
  });
}

export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof fetchProject>>>;

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

export function useMyCreatedProjects() {
  return useQuery({
    queryKey: queryKeys.myCreatedProjects,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_my_created_projects', {
        p_limit: 50,
        p_offset: 0,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMyProjectAssignments() {
  return useQuery({
    queryKey: queryKeys.myProjectAssignments,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_my_project_assignments', {
        p_limit: 50,
        p_offset: 0,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProjectAssignments(
  projectId: string | undefined,
  options?: { enabled?: boolean },
) {
  const id = projectId?.trim() ?? '';
  const mayFetch = options?.enabled !== false;
  return useQuery({
    queryKey: queryKeys.projectAssignments(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_project_assignments', {
        p_project_id: id,
        p_limit: 50,
        p_offset: 0,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: id.length > 0 && mayFetch,
  });
}

export function useProjectResponses(
  projectId: string | undefined,
  options?: { enabled?: boolean },
) {
  const id = projectId?.trim() ?? '';
  const mayFetch = options?.enabled !== false;
  return useQuery({
    queryKey: queryKeys.projectResponses(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_project_responses', {
        p_project_id: id,
        p_limit: 50,
        p_offset: 0,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: id.length > 0 && mayFetch,
  });
}

export function useProjectContributions(projectId: string | undefined) {
  const id = projectId?.trim() ?? '';
  return useQuery({
    queryKey: queryKeys.projectContributions(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_project_contributions', {
        p_project_id: id,
        p_limit: 50,
        p_offset: 0,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: id.length > 0,
  });
}

export function useProjectActivity(projectId: string | undefined) {
  const id = projectId?.trim() ?? '';
  return useQuery({
    queryKey: queryKeys.projectActivity(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_project_activity', {
        p_project_id: id,
        p_limit: 50,
        p_offset: 0,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: id.length > 0,
  });
}

export function useProjectAssignment(assignmentId: string | undefined) {
  const id = assignmentId?.trim() ?? '';
  return useQuery({
    queryKey: queryKeys.projectAssignment(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_project_assignment', {
        p_assignment_id: id,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: id.length > 0,
  });
}

export function useProjectAssignmentMilestones(assignmentId: string | undefined) {
  const id = assignmentId?.trim() ?? '';
  return useQuery({
    queryKey: queryKeys.projectAssignmentMilestones(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_project_assignment_milestones', {
        p_assignment_id: id,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: id.length > 0,
  });
}

export function useProjectAssignmentSubmissions(assignmentId: string | undefined) {
  const id = assignmentId?.trim() ?? '';
  return useQuery({
    queryKey: queryKeys.projectAssignmentSubmissions(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_project_assignment_submissions', {
        p_assignment_id: id,
        p_limit: 30,
        p_offset: 0,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: id.length > 0,
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

export function useContributeToProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string; amountMajor: number }) => {
      const { data, error } = await supabase.rpc('contribute_to_project', {
        p_project_id: input.projectId,
        p_amount_major: input.amountMajor,
        p_idempotency_key: createIdempotencyKey('project-contrib'),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_id, input) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(input.projectId) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projectContributions(input.projectId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectActivity(input.projectId) });
    },
  });
}

export function useContributionAccounting(contributionId: string | undefined) {
  const id = contributionId?.trim() ?? '';
  return useQuery({
    queryKey: queryKeys.projectContributionAccounting(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_project_contribution_accounting', {
        p_contribution_id: id,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: id.length > 0,
  });
}

export function useAcceptProjectAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.rpc('accept_project_assignment', {
        p_assignment_id: assignmentId,
      });
      if (error) throw error;
    },
    onSuccess: (_void, assignmentId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectAssignment(assignmentId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myProjectAssignments });
    },
  });
}

export function useReserveProjectAssignmentCompensation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.rpc('reserve_project_assignment_compensation', {
        p_assignment_id: assignmentId,
      });
      if (error) throw error;
    },
    onSuccess: (_void, assignmentId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectAssignment(assignmentId) });
    },
  });
}

export function useStartProjectAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.rpc('start_project_assignment', {
        p_assignment_id: assignmentId,
      });
      if (error) throw error;
    },
    onSuccess: (_void, assignmentId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectAssignment(assignmentId) });
    },
  });
}

export function useSubmitProjectAssignmentWork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { assignmentId: string; milestoneId?: string; note?: string }) => {
      const { data, error } = await supabase.rpc('submit_project_assignment_work', {
        p_assignment_id: input.assignmentId,
        p_milestone_id: input.milestoneId,
        p_note: input.note,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_void, input) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projectAssignment(input.assignmentId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projectAssignmentSubmissions(input.assignmentId),
      });
    },
  });
}
