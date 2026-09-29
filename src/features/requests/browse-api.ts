import { useQuery } from '@tanstack/react-query';

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
  | 'description'
  | 'requester_display_name'
  | 'requester_avatar_path'
  | 'requester_rating_average'
  | 'requester_rating_count'
>;

function roundCoordinate(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function useBrowseNearbyRequests(position: Position | null) {
  const latitude = position ? roundCoordinate(position.latitude) : null;
  const longitude = position ? roundCoordinate(position.longitude) : null;

  return useQuery({
    queryKey: queryKeys.browseNearby(latitude, longitude),
    enabled: position !== null,
    staleTime: 15_000,
    queryFn: async (): Promise<PublicRequest[]> => {
      if (!position) throw new Error('Location is required to browse nearby requests.');

      const { data, error } = await supabase.rpc('browse_nearby_requests', {
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
    queryFn: async (): Promise<PublicRequest | null> => {
      if (!position) throw new Error('Location is required to open this request.');

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
