import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useUserId } from '@/features/auth/session';
import type { Position } from '@/lib/location';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import type { Guaranteed, Nullable, RpcRow } from '@/lib/supabase/types';

type Functions = Database['public']['Functions'];

type RequestResponse = Nullable<
  RpcRow<Functions['list_request_responses']['Returns']>,
  | 'display_name'
  | 'avatar_path'
  | 'bio'
  | 'rating_average'
  | 'completion_percent'
  | 'message'
  | 'quoted_amount'
  | 'expires_at'
>;

type Engagement = Nullable<
  RpcRow<Functions['get_engagement']['Returns']>,
  | 'scheduled_for'
  | 'offered_amount'
  | 'agreed_provider_amount'
  | 'quoted_amount'
  | 'accepted_at'
  | 'started_at'
  | 'completed_at'
  | 'counterparty_display_name'
  | 'counterparty_avatar_path'
  | 'counterparty_bio'
  | 'counterparty_phone'
  | 'counterparty_rating_average'
  | 'counterparty_completion_percent'
  | 'rating_stars'
  | 'rating_comment'
  | 'viewer_has_rated'
  | 'payment_status'
  | 'handshake_id'
  | 'handshake_at'
  | 'service_problem_kind'
  | 'service_problem_respond_by'
  | 'service_problem_reported_by_me'
  | 'service_problem_description'
>;

const REQUEST_COLUMNS =
  'request_id, title, description, scheduled_for, offered_amount, agreed_provider_amount, currency, payment_status, location_label, latitude, longitude, status, selected_user_id, source_request_id, attachment_path, pending_response_count, is_rated, my_rating_stars, my_rating_comment, created_at, updated_at, expires_at, accepted_at, started_at, completed_at, cancelled_at';

type MyRequest = Guaranteed<
  Database['public']['Views']['my_requests']['Row'],
  | 'request_id'
  | 'title'
  | 'currency'
  | 'location_label'
  | 'latitude'
  | 'longitude'
  | 'status'
  | 'created_at'
  | 'pending_response_count'
  | 'is_rated'
  | 'attachment_path'
>;

export function useMyRequests() {
  return useQuery({
    queryKey: queryKeys.myRequests,
    queryFn: async (): Promise<MyRequest[]> => {
      const { data, error } = await supabase
        .from('my_requests')
        .select(REQUEST_COLUMNS)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as MyRequest[];
    },
  });
}

export function useMyRequest(requestId: string) {
  return useQuery({
    queryKey: queryKeys.myRequest(requestId),
    enabled: requestId.length > 0,
    queryFn: async (): Promise<MyRequest> => {
      const { data, error } = await supabase
        .from('my_requests')
        .select(REQUEST_COLUMNS)
        .eq('request_id', requestId)
        .single();

      if (error) throw error;
      return data as MyRequest;
    },
  });
}

export function useRequestResponses(requestId: string) {
  return useQuery({
    queryKey: queryKeys.requestResponses(requestId),
    queryFn: async (): Promise<RequestResponse[]> => {
      const { data, error } = await supabase.rpc('list_request_responses', {
        p_request_id: requestId,
      });

      if (error) throw error;
      return data;
    },
  });
}

type LiveRequestChannel = ReturnType<typeof supabase.channel>;

const liveRequestChannels = new Map<string, { refCount: number; channel: LiveRequestChannel }>();
const liveRequestTeardowns = new Map<string, Promise<void>>();
const liveRequestAcquires = new Map<string, Promise<void>>();

function invalidateLiveRequestQueries(
  queryClient: QueryClient,
  requestId: string,
  source: 'responses' | 'request',
) {
  if (source === 'responses') {
    queryClient.invalidateQueries({ queryKey: queryKeys.requestResponses(requestId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.myRequest(requestId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.myRequests });
    return;
  }

  queryClient.invalidateQueries({ queryKey: queryKeys.myRequest(requestId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.engagement(requestId) });
}

function createLiveRequestChannel(requestId: string, queryClient: QueryClient) {
  return supabase
    .channel(`request:${requestId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'request_responses',
        filter: `request_id=eq.${requestId}`,
      },
      () => invalidateLiveRequestQueries(queryClient, requestId, 'responses'),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'requests', filter: `id=eq.${requestId}` },
      () => invalidateLiveRequestQueries(queryClient, requestId, 'request'),
    )
    .subscribe();
}

async function acquireLiveRequestChannel(requestId: string, queryClient: QueryClient) {
  const pendingTeardown = liveRequestTeardowns.get(requestId);
  if (pendingTeardown) {
    await pendingTeardown;
  }

  const existing = liveRequestChannels.get(requestId);
  if (existing) {
    existing.refCount += 1;
    return;
  }

  const pendingAcquire = liveRequestAcquires.get(requestId);
  if (pendingAcquire) {
    await pendingAcquire;
    const shared = liveRequestChannels.get(requestId);
    if (shared) {
      shared.refCount += 1;
    }
    return;
  }

  const acquire = (async () => {
    const channel = createLiveRequestChannel(requestId, queryClient);
    liveRequestChannels.set(requestId, { refCount: 1, channel });
  })();

  liveRequestAcquires.set(requestId, acquire);
  try {
    await acquire;
  } finally {
    liveRequestAcquires.delete(requestId);
  }
}

async function releaseLiveRequestChannel(requestId: string) {
  const entry = liveRequestChannels.get(requestId);
  if (!entry) {
    return;
  }

  entry.refCount -= 1;
  if (entry.refCount > 0) {
    return;
  }

  liveRequestChannels.delete(requestId);
  const teardown = supabase.removeChannel(entry.channel).then(() => undefined);
  liveRequestTeardowns.set(requestId, teardown);
  try {
    await teardown;
  } finally {
    if (liveRequestTeardowns.get(requestId) === teardown) {
      liveRequestTeardowns.delete(requestId);
    }
  }
}

/**
 * Keeps an open request live. The requester can read both tables under RLS, so
 * Realtime delivers new responses and status changes as they happen instead of the
 * screen polling while someone waits for help.
 *
 * Multiple screens may call this for the same request; Supabase reuses channel
 * topics, so we ref-count a single subscription per request id.
 */
export function useLiveRequest(requestId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    void acquireLiveRequestChannel(requestId, queryClient).then(() => {
      if (cancelled) {
        void releaseLiveRequestChannel(requestId);
      }
    });

    return () => {
      cancelled = true;
      void releaseLiveRequestChannel(requestId);
    };
  }, [requestId, queryClient]);
}

export function useCreateRequest() {
  const queryClient = useQueryClient();
  const userId = useUserId();

  return useMutation({
    mutationFn: async (input: {
      title: string;
      description: string | null;
      position: Position;
      locationLabel: string;
      scheduledFor: Date | null;
      offeredAmount: number;
      sourceRequestId?: string;
      attachmentPath?: string | null;
    }) => {
      if (!userId) throw new Error('Sign in to create a request.');

      const trimmedDescription = input.description?.trim();
      const { data, error } = await supabase.rpc('create_request', {
        p_title: input.title.trim(),
        p_description: trimmedDescription || '',
        p_latitude: input.position.latitude,
        p_longitude: input.position.longitude,
        p_location_label: input.locationLabel,
        p_scheduled_for: input.scheduledFor?.toISOString(),
        p_offered_amount: input.offeredAmount,
        p_source_request_id: input.sourceRequestId,
        p_attachment_path: input.attachmentPath || undefined,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequests });
      queryClient.invalidateQueries({ queryKey: queryKeys.browseNearbyAll });
    },
  });
}

export function useCancelRequest(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('cancel_request', { p_request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequest(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequests });
      queryClient.invalidateQueries({ queryKey: queryKeys.engagement(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myResponses });
      queryClient.invalidateQueries({ queryKey: queryKeys.browseNearbyAll });
    },
  });
}

/** Accepting is what moves the privacy boundary, so it refreshes the engagement too. */
export function useAcceptResponse(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (responseId: string) => {
      const { error } = await supabase.rpc('accept_response', { p_response_id: responseId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequest(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequests });
      queryClient.invalidateQueries({ queryKey: queryKeys.requestResponses(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.engagement(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance });
      queryClient.invalidateQueries({ queryKey: queryKeys.myResponses });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequest(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.requestResponses(requestId) });
    },
  });
}

export function useDeclineResponse(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { responseId: string; reason: string | null }) => {
      const { error } = await supabase.rpc('decline_response', {
        p_response_id: input.responseId,
        p_reason: input.reason ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.requestResponses(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequest(requestId) });
    },
  });
}

export function useCompleteRequest(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('complete_request', { p_request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequest(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequests });
      queryClient.invalidateQueries({ queryKey: queryKeys.engagement(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });
}

export type ServiceProblemKind = Database['public']['Enums']['service_problem_kind'];

export type ReportServiceProblemInput = {
  kind: ServiceProblemKind;
  description?: string;
  evidencePaths?: string[];
};

export function useReportServiceProblem(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReportServiceProblemInput) => {
      const { error } = await supabase.rpc('report_service_problem', {
        p_request_id: requestId,
        p_kind: input.kind,
        p_description: input.description ?? '',
        p_evidence_paths: input.evidencePaths ?? [],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequest(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequests });
      queryClient.invalidateQueries({ queryKey: queryKeys.engagement(requestId) });
    },
  });
}

export function useContestServiceProblem(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('contest_service_problem', {
        p_request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequest(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequests });
      queryClient.invalidateQueries({ queryKey: queryKeys.myResponses });
      queryClient.invalidateQueries({ queryKey: queryKeys.engagement(requestId) });
    },
  });
}

export function useRateRequest(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { stars: number; comment: string | null }) => {
      const { error } = await supabase.rpc('rate_request', {
        p_request_id: requestId,
        p_stars: input.stars,
        p_comment: input.comment ?? undefined,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequest(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequests });
      queryClient.invalidateQueries({ queryKey: queryKeys.myResponses });
      queryClient.invalidateQueries({ queryKey: queryKeys.engagement(requestId) });
    },
  });
}

/** Shared by both parties once a request has been accepted. */
export function useCloneRequestFromPrior() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { sourceRequestId: string; idempotencyKey: string }) => {
      const { data, error } = await supabase.rpc('clone_request_from_prior', {
        p_source_request_id: input.sourceRequestId,
        p_idempotency_key: input.idempotencyKey,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.myRequests }),
  });
}

export function useEngagement(requestId: string) {
  return useQuery({
    queryKey: queryKeys.engagement(requestId),
    queryFn: async (): Promise<Engagement | null> => {
      const { data, error } = await supabase.rpc('get_engagement', { p_request_id: requestId });
      if (error) throw error;
      return data[0] ?? null;
    },
  });
}
