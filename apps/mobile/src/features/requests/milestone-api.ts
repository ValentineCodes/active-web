import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  milestoneItemsFromProposalJson,
  type MilestoneProposalItem,
  type MilestoneRpcItem,
  type PaymentStructure,
  serializeMilestonesForRpc,
} from '@/features/requests/milestones';
import { invalidateWalletQueries } from '@/features/wallet/api';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import type { RpcRow } from '@/lib/supabase/types';

type Functions = Database['public']['Functions'];

export type MilestoneProposalRow = RpcRow<Functions['list_request_milestone_proposals']['Returns']>;

export type EngagementMilestoneRow = RpcRow<Functions['list_engagement_milestones']['Returns']>;

export type RequestPaymentMeta = {
  paymentStructure: PaymentStructure;
  requesterMilestones: MilestoneProposalItem[];
  myProposedMilestones: MilestoneProposalItem[];
};

export function useRequestPaymentStructure(requestId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.requestPaymentStructure(requestId),
    enabled: enabled && requestId.length > 0,
    queryFn: async (): Promise<PaymentStructure> => {
      const { data, error } = await supabase
        .from('requests')
        .select('payment_structure')
        .eq('id', requestId)
        .maybeSingle();

      if (error) throw error;
      return (data?.payment_structure ?? 'single') as PaymentStructure;
    },
  });
}

export function useRequestMilestonePlanForRespond(requestId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.requestMilestonePlan(requestId),
    enabled: enabled && requestId.length > 0,
    queryFn: async (): Promise<RequestPaymentMeta> => {
      const { data, error } = await supabase.rpc('get_request_milestone_plan_for_respond', {
        p_request_id: requestId,
      });

      if (error) throw error;

      const row = data?.[0];
      const structure = (row?.payment_structure ?? 'single') as PaymentStructure;
      const parseItems = (json: unknown) =>
        milestoneItemsFromProposalJson(
          (json ?? []) as Array<{
            position?: number;
            title: string;
            description?: string | null;
            amount: number;
          }>,
        );

      return {
        paymentStructure: structure,
        requesterMilestones: parseItems(row?.milestones),
        myProposedMilestones: parseItems(row?.my_proposed_milestones),
      };
    },
  });
}

export function useRequestMilestoneProposals(requestId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.requestMilestoneProposals(requestId),
    enabled: enabled && requestId.length > 0,
    queryFn: async (): Promise<MilestoneProposalRow[]> => {
      const { data, error } = await supabase.rpc('list_request_milestone_proposals', {
        p_request_id: requestId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEngagementMilestones(requestId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.engagementMilestones(requestId),
    enabled: enabled && requestId.length > 0,
    queryFn: async (): Promise<EngagementMilestoneRow[]> => {
      const { data, error } = await supabase.rpc('list_engagement_milestones', {
        p_request_id: requestId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSubmitResponseMilestoneProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { responseId: string; requestId: string; items: MilestoneRpcItem[] }) => {
      const { error } = await supabase.rpc('submit_response_milestone_proposal', {
        p_response_id: input.responseId,
        p_milestones: serializeMilestonesForRpc(input.items),
      });
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.requestMilestoneProposals(input.requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.requestMilestonePlan(input.requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myResponses });
    },
  });
}

export function useSubmitEngagementMilestone(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (milestoneId: string) => {
      const { error } = await supabase.rpc('submit_engagement_milestone', {
        p_milestone_id: milestoneId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.engagementMilestones(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.engagement(requestId) });
    },
  });
}

export function useApproveEngagementMilestone(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (milestoneId: string) => {
      const { error } = await supabase.rpc('approve_engagement_milestone', {
        p_milestone_id: milestoneId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.engagementMilestones(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.engagement(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequest(requestId) });
      void invalidateWalletQueries(queryClient);
    },
  });
}

export function useSetRequestMilestoneDraft(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: MilestoneRpcItem[]) => {
      const { error } = await supabase.rpc('set_request_milestone_draft', {
        p_request_id: requestId,
        p_milestones: serializeMilestonesForRpc(items),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.requestMilestonePlan(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.requestMilestoneProposals(requestId) });
    },
  });
}

export function pickMilestonePlanForResponse(
  proposals: MilestoneProposalRow[],
  responseId: string,
): MilestoneProposalRow | null {
  const forResponse =
    proposals.find((row) => row.response_id === responseId && row.status !== 'superseded') ?? null;
  if (forResponse) return forResponse;

  return (
    proposals.find(
      (row) => row.response_id === null && row.status === 'draft',
    ) ?? null
  );
}

export function milestoneProposalItems(row: MilestoneProposalRow | null): MilestoneProposalItem[] {
  if (!row?.items || !Array.isArray(row.items)) return [];
  return milestoneItemsFromProposalJson(
    row.items as Array<{
      position?: number;
      title: string;
      description?: string | null;
      amount: number;
    }>,
  );
}

/** Counter-proposal milestone block for a pending response card (requester view). */
export function proposedMilestonesForResponseCard(
  proposals: MilestoneProposalRow[] | undefined,
  responseId: string,
  offeredAmount: number,
  quotedAmount: number | null,
): { items: MilestoneProposalItem[]; totalMajor: number } | null {
  if (!proposals?.length) return null;
  const row = proposals.find(
    (entry) => entry.response_id === responseId && entry.status === 'proposed',
  );
  if (!row) return null;
  const items = milestoneProposalItems(row);
  if (items.length < 2) return null;
  const totalMajor = quotedAmount !== null && quotedAmount > 0 ? quotedAmount : offeredAmount;
  return { items, totalMajor };
}

/** Milestone plan shown on the respond / helper request summary after a response exists. */
export function responderDisplayedMilestones(
  proposals: MilestoneProposalRow[] | undefined,
  responseId: string | undefined,
  requesterMilestones: MilestoneProposalItem[],
): {
  items: MilestoneProposalItem[];
  variant: 'default' | 'proposed';
  heading: string;
} {
  const fallback = {
    items: requesterMilestones,
    variant: 'default' as const,
    heading: 'Milestone payment plan',
  };
  if (!responseId || !proposals?.length) return fallback;

  const counter = proposals.find(
    (row) => row.response_id === responseId && row.status === 'proposed',
  );
  if (!counter) return fallback;

  const items = milestoneProposalItems(counter);
  if (items.length < 2) return fallback;

  return {
    items,
    variant: 'proposed',
    heading: 'Your proposed plan',
  };
}