import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import type { Nullable, RpcRow } from '@/lib/supabase/types';

type Functions = Database['public']['Functions'];

type NearbyRequest = Nullable<
  RpcRow<Functions['nearby_requests']['Returns']>,
  | 'scheduled_for'
  | 'offered_amount'
  | 'expires_at'
  | 'requester_display_name'
  | 'requester_avatar_path'
  | 'requester_rating_average'
>;

type MyResponse = Nullable<
  RpcRow<Functions['my_responses']['Returns']>,
  | 'scheduled_for'
  | 'offered_amount'
  | 'quoted_amount'
  | 'requester_display_name'
  | 'requester_avatar_path'
>;

/**
 * The provider's inbox. Eligibility is decided entirely by the database, and the rows
 * that come back carry a rounded distance and the requester's coarse area label rather
 * than a position.
 *
 * Providers cannot read public.requests before acceptance, so there is no Realtime
 * stream to subscribe to here. The inbox refreshes on focus, on pull, and when a push
 * notification arrives.
 */
export function useNearbyRequests(options: { enabled: boolean }) {
  return useQuery({
    queryKey: queryKeys.nearbyRequests,
    enabled: options.enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<NearbyRequest[]> => {
      const { data, error } = await supabase.rpc('nearby_requests');
      if (error) throw error;
      return data;
    },
  });
}

export function useMyResponses() {
  return useQuery({
    queryKey: queryKeys.myResponses,
    queryFn: async (): Promise<MyResponse[]> => {
      const { data, error } = await supabase.rpc('my_responses');
      if (error) throw error;
      return data;
    },
  });
}

export function useRespondToRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      requestId: string;
      message: string | null;
      quotedAmount: number | null;
      etaMinutes: number | null;
    }) => {
      const { error } = await supabase.rpc('respond_to_request', {
        p_request_id: input.requestId,
        p_message: input.message ?? undefined,
        p_quoted_amount: input.quotedAmount ?? undefined,
        p_eta_minutes: input.etaMinutes ?? undefined,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.nearbyRequests });
      queryClient.invalidateQueries({ queryKey: queryKeys.myResponses });
    },
  });
}

export function useWithdrawResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (responseId: string) => {
      const { error } = await supabase.rpc('withdraw_response', { p_response_id: responseId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myResponses });
      queryClient.invalidateQueries({ queryKey: queryKeys.nearbyRequests });
    },
  });
}

export function useStartRequest(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('start_request', { p_request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.engagement(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myResponses });
    },
  });
}
