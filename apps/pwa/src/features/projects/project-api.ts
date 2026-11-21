import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { DESCRIPTION_LIMITS, TITLE_LIMITS } from '@/config';
import { localDateIso, localTimeIso, REQUEST_EXPIRY_TIMEZONE } from '@/features/requests/request-expiry-core';
import { resolveRequestTagIdsForRpc, type RequestTag } from '@/features/requests/tags';
import { createIdempotencyKey } from '@/lib/idempotency-key';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

type FundingVisibility = Database['public']['Enums']['project_funding_visibility'];

export type MyProjectAssignmentRow =
  Database['public']['Functions']['list_my_project_assignments']['Returns'][number];

export type ProjectAssignmentDetail =
  Database['public']['Functions']['get_project_assignment']['Returns'][number];

export type ProjectAssignmentMilestoneRow =
  Database['public']['Functions']['list_project_assignment_milestones']['Returns'][number];

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
      void queryClient.invalidateQueries({ queryKey: queryKeys.browseOpenProjectsAll });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myEntitlements });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectContributions(input.projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectActivity(input.projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.browseOpenProjectsAll });
    },
  });
}

export function useMyProjectAssignments(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  return useQuery({
    queryKey: queryKeys.myProjectAssignments,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_my_project_assignments', {
        p_limit: 50,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as MyProjectAssignmentRow[];
    },
    enabled,
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

export function useProjectAssignment(assignmentId: string | undefined) {
  const id = assignmentId?.trim() ?? '';
  return useQuery({
    queryKey: queryKeys.projectAssignment(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_project_assignment', {
        p_assignment_id: id,
      });
      if (error) throw error;
      return (data?.[0] ?? null) as ProjectAssignmentDetail | null;
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
      return (data ?? []) as ProjectAssignmentMilestoneRow[];
    },
    enabled: id.length > 0,
  });
}

export function useApproveProjectAssignmentPayout(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { assignmentId: string; milestoneId?: string | null }) => {
      const { data, error } = await supabase.rpc('approve_and_payout_project_assignment', {
        p_assignment_id: input.assignmentId,
        p_milestone_id: input.milestoneId ?? undefined,
        p_idempotency_key: createIdempotencyKey('project-assignment-payout'),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_paymentId, input) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectAssignment(input.assignmentId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectAssignmentMilestones(input.assignmentId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectAssignments(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectResponses(projectId) });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.myProjectAssignments });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectAssignment(input.assignmentId) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projectAssignmentMilestones(input.assignmentId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myProjectAssignments });
    },
  });
}

export function useReportProjectAssignmentProblem(assignmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { description: string }) => {
      const { data, error } = await supabase.rpc('report_project_assignment_problem', {
        p_assignment_id: assignmentId,
        p_kind: 'completion_issue',
        p_description: input.description,
        p_evidence_paths: [],
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectAssignment(assignmentId) });
    },
  });
}

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