import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { useBrowseRequest, type BrowseRequestDetail } from '@/features/requests/browse-api';
import { useUserId } from '@/features/auth/session';
import type { Position } from '@/lib/location';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { ReportServiceProblemInput } from '@/features/requests/requester-api';
import type { Database } from '@/lib/supabase/database.types';
import type { Nullable, RpcRow } from '@/lib/supabase/types';
import { normalizeRequestStatus } from '@/features/domain/transitions';
import { normalizeRequestTagSlugs } from '@/features/requests/tags';

type Functions = Database['public']['Functions'];

type MyResponse = Nullable<
  RpcRow<Functions['my_responses']['Returns']>,
  | 'scheduled_for'
  | 'offered_amount'
  | 'quoted_amount'
  | 'requester_display_name'
  | 'requester_avatar_path'
  | 'requester_bio'
  | 'requester_rating_average'
  | 'requester_rating_count'
  | 'requester_completion_percent'
  | 'attachment_path'
  | 'decline_reason'
  | 'message'
>;

export type RespondableRequest = {
  request_id: string;
  title: string;
  description: string;
  scheduled_for: string | null;
  offered_amount: number | null;
  currency: string;
  location_label: string;
  distance_m: number;
  requester_id: string;
  requester_display_name: string | null;
  requester_avatar_path: string | null;
  requester_bio: string | null;
  requester_rating_average: number | null;
  requester_rating_count: number | null;
  requester_completion_percent: number | null;
  attachment_path: string | null;
  tag_slugs: string[];
  posted_at: string;
  respond_allowed: boolean;
};

export function canRespondToRequest(request: RespondableRequest): boolean {
  return request.respond_allowed;
}

function fromBrowseRequest(row: BrowseRequestDetail): RespondableRequest {
  return {
    request_id: row.request_id,
    title: row.title,
    description: row.description ?? '',
    scheduled_for: row.scheduled_for,
    offered_amount: row.offered_amount,
    currency: row.currency,
    location_label: row.location_label,
    distance_m: row.distance_m,
    requester_id: row.requester_id,
    requester_display_name: row.requester_display_name,
    requester_avatar_path: row.requester_avatar_path,
    requester_bio: row.requester_bio,
    requester_rating_average: row.requester_rating_average,
    requester_rating_count: row.requester_rating_count,
    requester_completion_percent: row.requester_completion_percent,
    attachment_path: row.attachment_path,
    tag_slugs: normalizeRequestTagSlugs(row.tag_slugs),
    posted_at: row.posted_at,
    respond_allowed: row.respond_allowed,
  };
}

function fromMyResponse(row: MyResponse): RespondableRequest {
  return {
    request_id: row.request_id,
    title: row.title,
    description: row.description ?? '',
    scheduled_for: row.scheduled_for,
    offered_amount: row.offered_amount,
    currency: row.currency,
    location_label: row.location_label,
    distance_m: row.distance_m,
    requester_id: row.requester_id,
    requester_display_name: row.requester_display_name,
    requester_avatar_path: row.requester_avatar_path,
    requester_bio: row.requester_bio,
    requester_rating_average: row.requester_rating_average,
    requester_rating_count: row.requester_rating_count,
    requester_completion_percent: row.requester_completion_percent,
    attachment_path: row.attachment_path,
    tag_slugs: [],
    posted_at: row.posted_at,
    respond_allowed: true,
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
  const pendingRow = mine.data?.find(
    (row) => row.request_id === requestId && row.response_status === 'pending',
  );
  const declinedRow = mine.data?.find(
    (row) => row.request_id === requestId && row.response_status === 'declined',
  );
  const browseEnabled = mine.isSuccess && !pendingRow && !declinedRow;
  const browse = useBrowseRequest(requestId, position, { enabled: browseEnabled });

  const participationRow = pendingRow ?? declinedRow ?? null;

  const request: RespondableRequest | null = participationRow
    ? fromMyResponse(participationRow)
    : browse.data
      ? fromBrowseRequest(browse.data)
      : null;

  const existing: ExistingResponse | null = pendingRow
    ? {
        responseId: pendingRow.response_id,
        message: pendingRow.message,
        quotedAmount: pendingRow.quoted_amount,
      }
    : null;

  const declinedParticipation =
    declinedRow && !pendingRow
      ? {
          declineReason: declinedRow.decline_reason,
          requestStillOpen: isOpenRequestStatus(declinedRow.request_status),
        }
      : null;

  const open =
    pendingRow != null
      ? isOpenRequestStatus(pendingRow.request_status)
      : declinedRow != null
        ? true
        : browse.data != null;

  return {
    request: open ? request : null,
    existingResponse: existing,
    declinedParticipation,
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

const liveResponseUpdates = {
  userId: null as string | null,
  subscribers: 0,
  channel: null as RealtimeChannel | null,
  queryClient: null as QueryClient | null,
};

function teardownLiveResponseChannel() {
  if (liveResponseUpdates.channel) {
    void supabase.removeChannel(liveResponseUpdates.channel);
    liveResponseUpdates.channel = null;
  }
  liveResponseUpdates.userId = null;
}

function invalidateLiveResponseQueries(
  queryClient: QueryClient,
  next: { status?: string; request_id?: string },
) {
  if (next.status !== 'accepted' && next.status !== 'pending') return;

  queryClient.invalidateQueries({ queryKey: queryKeys.attendance });
  queryClient.invalidateQueries({ queryKey: queryKeys.myResponses });
  queryClient.invalidateQueries({ queryKey: queryKeys.browseNearbyAll });
  queryClient.invalidateQueries({ queryKey: queryKeys.requestSearchAll });
  if (next.request_id) {
    queryClient.invalidateQueries({ queryKey: queryKeys.engagement(next.request_id) });
    if (next.status === 'accepted') {
      queryClient.invalidateQueries({ queryKey: queryKeys.requestConversation(next.request_id) });
    }
  }
}

export function useLiveResponseUpdates() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    liveResponseUpdates.queryClient = queryClient;

    if (liveResponseUpdates.userId && liveResponseUpdates.userId !== userId) {
      teardownLiveResponseChannel();
      liveResponseUpdates.subscribers = 0;
    }

    liveResponseUpdates.subscribers += 1;

    if (!liveResponseUpdates.channel) {
      liveResponseUpdates.userId = userId;
      liveResponseUpdates.channel = supabase
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
            const client = liveResponseUpdates.queryClient;
            if (!client) return;
            invalidateLiveResponseQueries(
              client,
              payload.new as { status?: string; request_id?: string },
            );
          },
        )
        .subscribe();
    }

    return () => {
      liveResponseUpdates.subscribers -= 1;
      if (liveResponseUpdates.subscribers <= 0) {
        liveResponseUpdates.subscribers = 0;
        teardownLiveResponseChannel();
      }
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

/** Prefill for the response offer step (counter or requester's posted amount). */
export function responseWizardInitialOffer(
  quotedAmount: number | null | undefined,
  requesterOffer: number,
): string {
  const quoted = quotedAmount != null ? Number(quotedAmount) : null;
  const offered = Number(requesterOffer);
  const amount =
    quoted != null && Number.isFinite(quoted) && quoted > 0
      ? quoted
      : offered;
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return String(Math.trunc(amount));
}

/** `null` means accept the requester's offer (no counter). */
export function counterOfferForRpc(
  requesterOffer: number,
  yourOfferRaw: string,
): number | null | 'invalid' {
  const parsed = parseResponseOfferAmount(yourOfferRaw);
  if (parsed === null) return 'invalid';
  const offered = Number(requesterOffer);
  if (parsed === offered) return null;
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
      queryClient.invalidateQueries({ queryKey: queryKeys.requestSearchAll });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequests });
      queryClient.invalidateQueries({ queryKey: queryKeys.browseNearbyAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.requestSearchAll });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.requestSearchAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance });
    },
  });
}
