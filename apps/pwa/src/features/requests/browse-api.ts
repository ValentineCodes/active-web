'use client';

import { keepPreviousData, useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query';

import type { Position } from '@/lib/geolocation';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import type { Nullable, RpcRow } from '@/lib/supabase/types';

type Functions = Database['public']['Functions'];

export type PublicRequest = Nullable<
  RpcRow<Functions['browse_nearby_requests']['Returns']>,
  | 'scheduled_for'
  | 'offered_amount'
  | 'distance_m'
  | 'requester_display_name'
  | 'requester_avatar_path'
  | 'requester_bio'
  | 'requester_rating_average'
  | 'requester_rating_count'
  | 'requester_completion_percent'
  | 'requester_identity_verified'
  | 'attachment_path'
  | 'posted_at'
>;

export type BrowseRequestDetail = Nullable<
  RpcRow<Functions['browse_request']['Returns']>,
  | 'scheduled_for'
  | 'offered_amount'
  | 'requester_display_name'
  | 'requester_avatar_path'
  | 'requester_bio'
  | 'requester_rating_average'
  | 'requester_rating_count'
  | 'requester_completion_percent'
  | 'requester_identity_verified'
  | 'attachment_path'
>;

function roundCoordinate(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** Feed card rows lack `respond_allowed` — refreshed on `browse_request`. */
export function publicRequestToBrowseDetail(row: PublicRequest): BrowseRequestDetail {
  return {
    request_id: row.request_id,
    title: row.title,
    description: row.description ?? '',
    scheduled_for: row.scheduled_for,
    offered_amount: row.offered_amount,
    currency: row.currency,
    location_label: row.location_label,
    distance_m: row.distance_m ?? 0,
    posted_at: row.posted_at ?? '',
    requester_id: row.requester_id,
    requester_display_name: row.requester_display_name,
    requester_avatar_path: row.requester_avatar_path,
    requester_bio: row.requester_bio,
    requester_rating_average: row.requester_rating_average,
    requester_rating_count: row.requester_rating_count,
    requester_completion_percent: row.requester_completion_percent,
    requester_identity_verified: row.requester_identity_verified,
    attachment_path: row.attachment_path,
    tag_slugs: [],
    respond_allowed: true,
  };
}

export function seedBrowseRequestFromFeed(
  client: QueryClient,
  row: PublicRequest,
  position: Position | null,
) {
  const detail = publicRequestToBrowseDetail(row);
  client.setQueryData(queryKeys.browseRequestPreview(row.request_id), detail);
  if (!position) return;
  const latitude = roundCoordinate(position.latitude);
  const longitude = roundCoordinate(position.longitude);
  client.setQueryData(queryKeys.browseRequest(row.request_id, latitude, longitude), detail);
}

export function useBrowseRequestPreview(requestId: string) {
  return useQuery({
    queryKey: queryKeys.browseRequestPreview(requestId),
    enabled: false,
    staleTime: Infinity,
    queryFn: (): BrowseRequestDetail | null => null,
  });
}

export const HOME_BROWSE_PAGE_SIZE = 10;

function nextBrowseOffset(lastPage: PublicRequest[], pageParam: number) {
  if (lastPage.length < HOME_BROWSE_PAGE_SIZE) return undefined;
  return pageParam + HOME_BROWSE_PAGE_SIZE;
}

async function recordDiscoveryCoordinates(position: Position) {
  const { error } = await supabase.rpc('record_discovery_coordinates', {
    p_latitude: position.latitude,
    p_longitude: position.longitude,
  });
  if (error) throw error;
}

export function useBrowseOpenRequests(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;

  return useQuery({
    queryKey: queryKeys.browseOpen,
    enabled,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PublicRequest[]> => {
      const { data, error } = await supabase.rpc('browse_open_requests');
      if (error) throw error;
      return data;
    },
  });
}

export function useBrowseNearbyRequests(position: Position | null) {
  const latitude = position ? roundCoordinate(position.latitude) : null;
  const longitude = position ? roundCoordinate(position.longitude) : null;

  return useQuery({
    queryKey: queryKeys.browseNearby(latitude, longitude),
    enabled: position !== null,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PublicRequest[]> => {
      if (!position) throw new Error('Location is required to browse nearby requests.');

      await recordDiscoveryCoordinates(position);

      const { data, error } = await supabase.rpc('browse_nearby_requests', {
        p_latitude: position.latitude,
        p_longitude: position.longitude,
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useSearchRequests(query: string, position: Position | null) {
  const trimmed = query.trim();
  const latitude = position ? roundCoordinate(position.latitude) : null;
  const longitude = position ? roundCoordinate(position.longitude) : null;

  return useQuery({
    queryKey: queryKeys.requestSearch(trimmed, latitude, longitude),
    enabled: position !== null && trimmed.length > 0,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PublicRequest[]> => {
      if (!position) throw new Error('Location is required to search requests.');
      if (!trimmed) return [];

      await recordDiscoveryCoordinates(position);

      const { data, error } = await supabase.rpc('search_requests', {
        p_query: trimmed,
        p_latitude: position.latitude,
        p_longitude: position.longitude,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useBrowseOpenRequestsInfinite(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;

  return useInfiniteQuery({
    queryKey: [...queryKeys.browseOpen, 'pages'],
    enabled,
    initialPageParam: 0,
    staleTime: 15_000,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('browse_open_requests', {
        p_limit: HOME_BROWSE_PAGE_SIZE,
        p_offset: pageParam,
      });
      if (error) throw error;
      return data;
    },
    getNextPageParam: (lastPage, _pages, pageParam) => nextBrowseOffset(lastPage, pageParam),
  });
}

export function useBrowseNearbyRequestsInfinite(position: Position | null) {
  const latitude = position ? roundCoordinate(position.latitude) : null;
  const longitude = position ? roundCoordinate(position.longitude) : null;

  return useInfiniteQuery({
    queryKey: [...queryKeys.browseNearby(latitude, longitude), 'pages'],
    enabled: position !== null,
    initialPageParam: 0,
    staleTime: 15_000,
    queryFn: async ({ pageParam }) => {
      if (!position) throw new Error('Location is required to browse nearby requests.');

      if (pageParam === 0) {
        await recordDiscoveryCoordinates(position);
      }

      const { data, error } = await supabase.rpc('browse_nearby_requests', {
        p_latitude: position.latitude,
        p_longitude: position.longitude,
        p_limit: HOME_BROWSE_PAGE_SIZE,
        p_offset: pageParam,
      });
      if (error) throw error;
      return data;
    },
    getNextPageParam: (lastPage, _pages, pageParam) => nextBrowseOffset(lastPage, pageParam),
  });
}

export function useSearchRequestsInfinite(query: string, position: Position | null) {
  const trimmed = query.trim();
  const latitude = position ? roundCoordinate(position.latitude) : null;
  const longitude = position ? roundCoordinate(position.longitude) : null;

  return useInfiniteQuery({
    queryKey: [...queryKeys.requestSearch(trimmed, latitude, longitude), 'pages'],
    enabled: position !== null && trimmed.length > 0,
    initialPageParam: 0,
    staleTime: 15_000,
    queryFn: async ({ pageParam }) => {
      if (!position) throw new Error('Location is required to search requests.');
      if (!trimmed) return [];

      if (pageParam === 0) {
        await recordDiscoveryCoordinates(position);
      }

      const { data, error } = await supabase.rpc('search_requests', {
        p_query: trimmed,
        p_latitude: position.latitude,
        p_longitude: position.longitude,
        p_limit: HOME_BROWSE_PAGE_SIZE,
        p_offset: pageParam,
      });
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (lastPage, _pages, pageParam) => nextBrowseOffset(lastPage, pageParam),
  });
}

export function useBrowseRequest(
  requestId: string,
  position: Position | null,
  options?: { enabled?: boolean },
) {
  const latitude = position ? roundCoordinate(position.latitude) : null;
  const longitude = position ? roundCoordinate(position.longitude) : null;
  const enabled = (options?.enabled ?? true) && position !== null;

  return useQuery({
    queryKey: queryKeys.browseRequest(requestId, latitude, longitude),
    enabled,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<BrowseRequestDetail | null> => {
      if (!position) throw new Error('Location is required to open this request.');

      await recordDiscoveryCoordinates(position);

      const { data, error } = await supabase.rpc('browse_request', {
        p_request_id: requestId,
        p_latitude: position.latitude,
        p_longitude: position.longitude,
      });
      if (error) throw error;
      return data[0] ?? null;
    },
  });
}
