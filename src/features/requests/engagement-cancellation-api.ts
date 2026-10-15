import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { engagementCancellationPollIntervalMs } from '@/features/requests/engagement-cancellation-ui';
import { invalidateWalletQueries } from '@/features/wallet/api';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import type { RpcRow } from '@/lib/supabase/types';

type Functions = Database['public']['Functions'];

export type EngagementCancellation = RpcRow<
  Functions['get_engagement_cancellation']['Returns']
>;

export function invalidateEngagementCancellationQueries(
  queryClient: QueryClient,
  requestId: string,
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.engagementCancellation(requestId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.engagement(requestId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.myRequest(requestId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.requestResponses(requestId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.myRequests });
  queryClient.invalidateQueries({ queryKey: queryKeys.myResponses });
  queryClient.invalidateQueries({ queryKey: queryKeys.requestConversation(requestId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.browseNearbyAll });
  queryClient.invalidateQueries({ queryKey: queryKeys.browseOpenAll });
  queryClient.invalidateQueries({ queryKey: queryKeys.requestSearchAll });
  queryClient.invalidateQueries({ queryKey: queryKeys.attendance });
  void invalidateWalletQueries(queryClient);
}

export function useEngagementCancellation(requestId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.engagementCancellation(requestId),
    enabled: Boolean(requestId) && enabled,
    queryFn: async (): Promise<EngagementCancellation | null> => {
      const { data, error } = await supabase.rpc('get_engagement_cancellation', {
        p_request_id: requestId,
      });
      if (error) throw error;
      const row = data[0];
      if (!row?.cancellation_request_id) {
        return null;
      }
      return row as EngagementCancellation;
    },
    refetchInterval: (query) => {
      const row = query.state.data;
      return engagementCancellationPollIntervalMs(row?.respond_by, row?.status);
    },
  });
}

export function useRequestEngagementCancellation(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reason: string | null) => {
      const { data, error } = await supabase.rpc('request_engagement_cancellation', {
        p_request_id: requestId,
        p_reason: reason ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateEngagementCancellationQueries(queryClient, requestId);
    },
  });
}

export function useRespondEngagementCancellation(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { agree: boolean; reason?: string | null }) => {
      const { error } = await supabase.rpc('respond_engagement_cancellation', {
        p_request_id: requestId,
        p_agree: input.agree,
        p_reason: input.reason ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateEngagementCancellationQueries(queryClient, requestId);
    },
  });
}

export function useCancelEngagementAsProvider(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reason: string | null) => {
      const { error } = await supabase.rpc('cancel_engagement_as_provider', {
        p_request_id: requestId,
        p_reason: reason ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateEngagementCancellationQueries(queryClient, requestId);
    },
  });
}
