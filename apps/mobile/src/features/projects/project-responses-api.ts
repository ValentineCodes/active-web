import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { MARKET } from '@/config';
import type { DeliveryDurationUnit } from '@/features/requests/delivery-duration';
import {
  responseWizardInitialOffer,
  type ExistingResponse,
  type RespondableRequest,
} from '@/features/requests/responses-api';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import { useProject } from '@/features/projects/project-api';

type ProjectDetail = NonNullable<ReturnType<typeof useProject>['data']>;

function budgetMajor(detail: ProjectDetail) {
  return detail.budget_total_kobo / 100;
}

export function projectToRespondable(detail: ProjectDetail): RespondableRequest {
  return {
    request_id: detail.project_id,
    title: detail.title,
    description: detail.description ?? '',
    scheduled_for: detail.funding_deadline_at,
    offered_amount: budgetMajor(detail),
    currency: MARKET.currency,
    location_label: detail.location_label ?? '',
    distance_m: 0,
    requester_id: detail.creator_id,
    requester_display_name: detail.creator_display_name,
    requester_avatar_path: detail.creator_avatar_path,
    requester_bio: detail.creator_bio ?? null,
    requester_rating_average: detail.creator_rating_average,
    requester_rating_count: detail.creator_rating_count,
    requester_completion_percent: detail.creator_completion_percent,
    requester_identity_verified: detail.creator_identity_verified,
    attachment_path: detail.attachment_path,
    tag_slugs: detail.tag_slugs ?? [],
    posted_at: detail.funding_opened_at ?? detail.funding_deadline_at ?? new Date().toISOString(),
    respond_allowed: !detail.viewer_is_creator,
  };
}

export function canRespondToProject(detail: ProjectDetail): boolean {
  if (detail.viewer_is_creator) return false;
  if (detail.funding_status === 'unsuccessful') return false;
  if (detail.status === 'funding_unsuccessful') return false;
  return true;
}

export function useMyProjectResponse(projectId: string) {
  const id = projectId.trim();
  return useQuery({
    queryKey: queryKeys.myProjectResponse(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_project_response', {
        p_project_id: id,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: id.length > 0,
  });
}

export function useProjectForRespond(projectId: string) {
  const project = useProject(projectId);
  const myResponse = useMyProjectResponse(projectId);
  const detail = project.data;

  const existingResponse: ExistingResponse | null = myResponse.data
    ? {
        responseId: myResponse.data.assignment_id,
        message: myResponse.data.message,
        quotedAmount: myResponse.data.compensation_major,
        proposedDeliveryDurationValue: myResponse.data.proposed_delivery_duration_value,
        proposedDeliveryDurationUnit: myResponse.data.proposed_delivery_duration_unit,
        proposedDeliveryAt: null,
        proposedDeliveryTimezone: null,
      }
    : null;

  const request = detail ? projectToRespondable(detail) : null;

  return {
    project: detail,
    request,
    existingResponse,
    isPending: project.isPending || myResponse.isPending,
    isError: project.isError || myResponse.isError,
    error: project.error ?? myResponse.error,
    refetch: async () => {
      await Promise.all([project.refetch(), myResponse.refetch()]);
    },
    respondAllowed: detail ? canRespondToProject(detail) : false,
  };
}

export function projectResponseWizardInitialOffer(
  existingQuoted: number | null | undefined,
  budgetMajorAmount: number,
) {
  return responseWizardInitialOffer(existingQuoted, budgetMajorAmount);
}

export function useRespondToProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      message: string | null;
      compensationMajor: number;
      proposedDeliveryDurationValue: number;
      proposedDeliveryDurationUnit: DeliveryDurationUnit;
    }) => {
      const { data, error } = await supabase.rpc('respond_to_project', {
        p_project_id: input.projectId,
        p_message: input.message ?? undefined,
        p_compensation_major: input.compensationMajor,
        p_proposed_delivery_duration_value: input.proposedDeliveryDurationValue,
        p_proposed_delivery_duration_unit: input.proposedDeliveryDurationUnit,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, input) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.myProjectResponse(input.projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(input.projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myProjectAssignments });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectAssignments(input.projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectResponses(input.projectId) });
    },
  });
}

export function useWithdrawProjectResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase.rpc('withdraw_project_response', {
        p_project_id: projectId,
      });
      if (error) throw error;
    },
    onSuccess: (_void, projectId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.myProjectResponse(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myProjectAssignments });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectAssignments(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectResponses(projectId) });
    },
  });
}