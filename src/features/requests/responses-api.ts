import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useBrowseRequest, type PublicRequest } from '@/features/requests/browse-api';
import { useUserId } from '@/features/auth/session';
import type { Position } from '@/lib/location';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { ReportServiceProblemInput } from '@/features/requests/requester-api';
import type { Database } from '@/lib/supabase/database.types';
import type { Nullable, RpcRow } from '@/lib/supabase/types';
import { normalizeRequestStatus } from '@/features/domain/transitions';

type Functions = Database['public']['Functions'];

type MyResponse = Nullable<
  RpcRow<Functions['my_responses']['Returns']>,
  | 'scheduled_for'
  | 'offered_amount'
  | 'quoted_amount'
  | 'requester_display_name'
  | 'requester_avatar_path'
  | 'decline_reason'
  | 'message'
  | 'description'
>;

export type RespondableRequest = {
  request_id: string;
  title: string;
  description: string | null;
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

function fromPublicRequest(row: PublicRequest): RespondableRequest {
  return {
    request_id: row.request_id,
    title: row.title,
    description: row.description,
    scheduled_for: row.scheduled_for,
    offered_amount: row.offered_amount,
    currency: row.currency,
    location_label: row.location_label,
    distance_m: row.distance_m,
    requester_display_name: row.requester_display_name,
    requester_avatar_path: row.requester_avatar_path,
    requester_rating_average: row.requester_rating_average,
    requester_rating_count: row.requester_rating_count,
  };
}

function fromMyResponse(row: MyResponse): RespondableRequest {
  return {
    request_id: row.request_id,
    title: row.title,
    description: row.description,
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

export type ExistingResponse = {
  responseId: string;
  message: string | null;
  quotedAmount: number | null;
};

function isOpenRequestStatus(status: string | null | undefined): boolean {
  const normalized = status ? normalizeRequestStatus(status as never) : null;
  return normalized === 'posted';
}

/** Opens a request for responding via browse + the caller's existing response row. */
export function useRequestForResponse(requestId: string, position: Position | null) {
  const mine = useMyResponses();
  const existingResponse = mine.data?.find(
    (row) => row.request_id === requestId && row.response_status === 'pending',
  );
  const browseEnabled = mine.isSuccess && !existingResponse;
  const browse = useBrowseRequest(requestId, position, { enabled: browseEnabled });

  const request: RespondableRequest | null = existingResponse
    ? fromMyResponse(existingResponse)
    : browse.data
      ? fromPublicRequest(browse.data)
      : null;

  const existing: ExistingResponse | null = existingResponse
    ? {
        responseId: existingResponse.response_id,
        message: existingResponse.message,
        quotedAmount: existingResponse.quoted_amount,
      }
    : null;

  const open =
    existingResponse != null
      ? isOpenRequestStatus(existingResponse.request_status)
      : browse.data != null;

  return {
    request: open ? request : null,
    existingResponse: existing,
    needsLocation: browseEnabled && position === null,
    isFetchingMatch: browse.isFetching,
    isPending: mine.isPending || (browseEnabled && position !== null && browse.isPending),
    isError: browse.isError || mine.isError,
    error: browse.error ?? mine.error,
    refetch: () => {
      void browse.refetch();
      void mine.refetch();
    },
  };
}

export function useLiveResponseUpdates() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`responses:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'request_responses',
          filter: `responder_id=eq.${userId}`,
        },
        (payload) => {
          const next = payload.new as { status?: string; request_id?: string };
          if (next.status !== 'accepted' && next.status !== 'pending') return;

          queryClient.invalidateQueries({ queryKey: queryKeys.attendance });
          queryClient.invalidateQueries({ queryKey: queryKeys.myResponses });
          queryClient.invalidateQueries({ queryKey: queryKeys.browseNearbyAll });
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

export function parseResponseOfferAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/[^\d.]/g, ''));
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return parsed;
}

/** `null` means accept the requester's offer (no counter). */
export function counterOfferForRpc(
  requesterOffer: number,
  yourOfferRaw: string,
): number | null | 'invalid' {
  const parsed = parseResponseOfferAmount(yourOfferRaw);
  if (parsed === null) return 'invalid';
  if (parsed === requesterOffer) return null;
  return parsed;
}

export function useRespondToRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      requestId: string;
      message: string | null;
      quotedAmount: number | null;
      position: Position | null;
    }) => {
      if (!input.position) throw new Error('Location is required to respond.');

      const { error } = await supabase.rpc('respond_to_request', {
        p_request_id: input.requestId,
        p_message: input.message ?? undefined,
        p_quoted_amount: input.quotedAmount ?? undefined,
        p_latitude: input.position.latitude,
        p_longitude: input.position.longitude,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.browseNearbyAll });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.browseNearbyAll });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance });
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

export function useReportClientNoShow(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input?: Pick<ReportServiceProblemInput, 'description' | 'evidencePaths'>,
    ) => {
      const { error } = await supabase.rpc('report_service_problem', {
        p_request_id: requestId,
        p_kind: 'client_no_show',
        p_description: input?.description ?? '',
        p_evidence_paths: input?.evidencePaths ?? [],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.engagement(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myResponses });
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequests });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.browseNearbyAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance });
    },
  });
}
