import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  buildCategoryData,
  type CategoryDetailsForm,
  type RequestCategorySlug,
} from '@/features/requests/category-data';
import { uploadRequestPhotos } from '@/features/requests/request-media';
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
  | 'message'
  | 'quoted_amount'
  | 'eta_minutes'
  | 'expires_at'
>;

type Engagement = Nullable<
  RpcRow<Functions['get_engagement']['Returns']>,
  | 'scheduled_for'
  | 'offered_amount'
  | 'quoted_amount'
  | 'accepted_at'
  | 'started_at'
  | 'completed_at'
  | 'provider_latitude'
  | 'provider_longitude'
  | 'counterparty_display_name'
  | 'counterparty_avatar_path'
  | 'counterparty_phone'
  | 'counterparty_rating_average'
  | 'rating_stars'
  | 'payment_status'
  | 'handshake_id'
  | 'handshake_at'
>;

const REQUEST_COLUMNS =
  'request_id, category_slug, description, category_data, scheduled_for, offered_amount, currency, payment_status, location_label, latitude, longitude, search_radius_m, radius_expansions, status, provider_id, source_request_id, pending_response_count, is_rated, created_at, expires_at, accepted_at, started_at, completed_at, cancelled_at';

/** The columns public.requests declares NOT NULL, plus the two the view always computes. */
type MyRequest = Guaranteed<
  Database['public']['Views']['my_requests']['Row'],
  | 'request_id'
  | 'category_slug'
  | 'description'
  | 'category_data'
  | 'currency'
  | 'location_label'
  | 'latitude'
  | 'longitude'
  | 'search_radius_m'
  | 'radius_expansions'
  | 'status'
  | 'created_at'
  | 'pending_response_count'
  | 'is_rated'
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
      categorySlug: RequestCategorySlug;
      description: string;
      position: Position;
      locationLabel: string;
      searchRadiusM: number;
      scheduledFor: Date | null;
      offeredAmount: number | null;
      categoryDetails: CategoryDetailsForm;
      sourceRequestId?: string;
    }) => {
      if (!userId) throw new Error('Sign in to create a request.');

      const photoPaths =
        input.categoryDetails.photoUris.length > 0
          ? await uploadRequestPhotos(
              userId,
              input.categoryDetails.photoUris.map((uri) => ({ uri })),
            )
          : [];

      const categoryData = buildCategoryData(input.categorySlug, input.categoryDetails, photoPaths);

      const { data, error } = await supabase.rpc('create_request', {
        p_category_slug: input.categorySlug,
        p_description: input.description,
        p_latitude: input.position.latitude,
        p_longitude: input.position.longitude,
        p_location_label: input.locationLabel,
        p_search_radius_m: input.searchRadiusM,
        p_scheduled_for: input.scheduledFor?.toISOString(),
        p_offered_amount: input.offeredAmount ?? undefined,
        p_category_data: categoryData,
        p_source_request_id: input.sourceRequestId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.myRequests }),
  });
}

export function useExpandRadius(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('expand_request_radius', {
        p_request_id: requestId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequest(requestId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myRequests });
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
