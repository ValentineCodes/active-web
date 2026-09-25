import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useBrowseRequest, type PublicRequest } from '@/features/requests/browse-api';
import { useUserId } from '@/features/auth/session';
import type { Position } from '@/lib/location';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { Database, Json } from '@/lib/supabase/database.types';
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

export type RespondableRequest = {
  request_id: string;
  category_slug: string;
  description: string;
  category_data: Json;
  scheduled_for: string | null;
  offered_amount: number | null;
  currency: string;
  location_label: string;
  distance_m: number;
  requester_display_name: string | null;
  requester_avatar_path: string | null;
  requester_rating_average: number | null;
  requester_rating_count: number | null;
};

function fromInboxRequest(row: NearbyRequest): RespondableRequest {
  return {
    request_id: row.request_id,
    category_slug: row.category_slug,
    description: row.description,
    category_data: row.category_data,
    scheduled_for: row.scheduled_for,
    offered_amount: row.offered_amount,
    currency: row.currency,
    location_label: row.location_label,
    distance_m: row.distance_m,
    requester_display_name: row.requester_display_name,
    requester_avatar_path: row.requester_avatar_path,
    requester_rating_average: row.requester_rating_average,
    requester_rating_count: row.requester_rating_count ?? null,
  };
}

function fromPublicRequest(row: PublicRequest): RespondableRequest {
  return {
    request_id: row.request_id,
    category_slug: row.category_slug,
    description: row.description,
    category_data: row.category_data,
    scheduled_for: row.scheduled_for,
    offered_amount: row.offered_amount,
    currency: row.currency,
    location_label: row.location_label,
    distance_m: row.distance_m,
    requester_display_name: null,
    requester_avatar_path: null,
    requester_rating_average: null,
    requester_rating_count: null,
  };
}

type MyResponse = Nullable<
  RpcRow<Functions['my_responses']['Returns']>,
  | 'scheduled_for'
  | 'offered_amount'
  | 'quoted_amount'
  | 'requester_display_name'
  | 'requester_avatar_path'
  | 'decline_reason'
  | 'message'
  | 'eta_minutes'
>;

function fromMyResponse(row: MyResponse): RespondableRequest {
  return {
    request_id: row.request_id,
    category_slug: row.category_slug,
    description: row.description,
    category_data: row.category_data,
    scheduled_for: row.scheduled_for,
    offered_amount: row.offered_amount,
    currency: row.currency,
    location_label: row.location_label,
    distance_m: row.distance_m,
    requester_display_name: row.requester_display_name,
    requester_avatar_path: row.requester_avatar_path,
    requester_rating_average: null,
    requester_rating_count: null,
  };
}

export type ExistingProviderResponse = {
  responseId: string;
  message: string | null;
  quotedAmount: number | null;
  etaMinutes: number | null;
};

/** One respond-screen row: provider inbox when eligible, otherwise the public browse RPC. */
export function useRequestForResponse(requestId: string, position: Position | null) {
  const nearby = useNearbyRequests({ enabled: true });
  const mine = useMyResponses();
  const inbox = nearby.data?.find((item) => item.request_id === requestId);
  const existingResponse = mine.data?.find(
    (row) =>
      row.request_id === requestId &&
      row.response_status === 'pending' &&
      row.request_status === 'searching',
  );
  const browseEnabled = nearby.isSuccess && !inbox && !existingResponse;
  const browse = useBrowseRequest(requestId, position, { enabled: browseEnabled });

  const request: RespondableRequest | null = inbox
    ? fromInboxRequest(inbox)
    : existingResponse
      ? fromMyResponse(existingResponse)
      : browse.data
        ? fromPublicRequest(browse.data)
        : null;

  const existing: ExistingProviderResponse | null = existingResponse
    ? {
        responseId: existingResponse.response_id,
        message: existingResponse.message,
        quotedAmount: existingResponse.quoted_amount,
        etaMinutes: existingResponse.eta_minutes,
      }
    : null;

  return {
    request,
    existingResponse: existing,
    hasRequesterProfile: Boolean(inbox || existingResponse),
    needsLocation: nearby.isSuccess && !inbox && !existingResponse && position === null,
    isFetchingMatch: nearby.isFetching,
    isPending:
      nearby.isPending ||
      mine.isPending ||
      (browseEnabled && position !== null && browse.isPending),
    isError: nearby.isError || browse.isError || mine.isError,
    error: nearby.error ?? browse.error ?? mine.error,
    refetch: () => {
      void nearby.refetch();
      void browse.refetch();
      void mine.refetch();
    },
  };
}

/**
 * The provider's inbox. Eligibility is decided entirely by the database, and the rows
 * that come back carry a rounded distance and the requester's coarse area label rather
 * than a position.
 *
 * Providers cannot read public.requests before acceptance, so there is no Realtime
 * stream to subscribe to here. The inbox refreshes on focus, on pull, and when a push
 * notification arrives.
 */
/**
 * While Active or committed to a job, refresh when a requester selects this provider
 * (response accepted) or when commitment clears at the end of a job.
 */
export function useLiveProviderHandshake() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`provider-handshake:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'request_responses',
          filter: `provider_id=eq.${userId}`,
        },
        (payload) => {
          const next = payload.new as { status?: string; request_id?: string };
          if (next.status !== 'accepted' && next.status !== 'pending') return;

          queryClient.invalidateQueries({ queryKey: queryKeys.availability });
          queryClient.invalidateQueries({ queryKey: queryKeys.myResponses });
          queryClient.invalidateQueries({ queryKey: queryKeys.nearbyRequests });
          if (next.request_id) {
            queryClient.invalidateQueries({ queryKey: queryKeys.engagement(next.request_id) });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}

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
      position: Position | null;
    }) => {
      const { error } = await supabase.rpc('respond_to_request', {
        p_request_id: input.requestId,
        p_message: input.message ?? undefined,
        p_quoted_amount: input.quotedAmount ?? undefined,
        p_eta_minutes: input.etaMinutes ?? undefined,
        p_latitude: input.position?.latitude,
        p_longitude: input.position?.longitude,
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

export function useMarkServiceComplete(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_service_complete', { p_request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.engagement(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myResponses });
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequests });
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

export function useCancelService(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('cancel_service', { p_request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.engagement(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myResponses });
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequests });
      queryClient.invalidateQueries({ queryKey: queryKeys.nearbyRequests });
    },
  });
}
