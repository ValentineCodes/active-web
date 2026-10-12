import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { Position } from '@/lib/location';
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
  | 'requester_rating_average'
  | 'requester_rating_count'
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
  | 'attachment_path'
>;

function roundCoordinate(value: number) {
  return Math.round(value * 1000) / 1000;
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
      return data;
    },
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
