import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/features/auth/session';
import type { Position } from '@/lib/location';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import type { Guaranteed } from '@/lib/supabase/types';

/**
 * `status` and `category_slugs` always resolve; the radius and window are null exactly
 * when the user is offline.
 */
type MyAvailability = Guaranteed<
  Database['public']['Views']['my_availability']['Row'],
  'status' | 'category_slugs'
>;

export function useAvailability() {
  const userId = useUserId();

  return useQuery({
    queryKey: queryKeys.availability,
    queryFn: async (): Promise<MyAvailability> => {
      const { data, error } = await supabase
        .from('my_availability')
        .select('status, service_radius_m, went_active_at, expires_at, category_slugs')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      return data as MyAvailability;
    },
    // The window lapses on a clock, so the banner should not sit on a stale value.
    refetchInterval: 60_000,
  });
}

/**
 * The position is captured by the screen immediately after the user taps Go Active, so
 * the permission prompt is attached to that choice and nothing else.
 */
export function useGoActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      position: Position;
      categorySlugs: string[];
      serviceRadiusM: number;
      durationMinutes: number;
    }) => {
      const { error } = await supabase.rpc('go_active', {
        p_latitude: input.position.latitude,
        p_longitude: input.position.longitude,
        p_service_radius_m: input.serviceRadiusM,
        p_categories: input.categorySlugs,
        p_duration_minutes: input.durationMinutes,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.availability });
      queryClient.invalidateQueries({ queryKey: queryKeys.nearbyRequests });
    },
  });
}

export function useGoOffline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('go_offline');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.availability });
      queryClient.invalidateQueries({ queryKey: queryKeys.nearbyRequests });
    },
  });
}

/**
 * Moves the provider's matching position without prompting for anything. Called when the
 * inbox is refreshed while Active, so a provider who has travelled is matched against
 * where they now are rather than where they started.
 */
export function useRefreshActivePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (position: Position) => {
      const { error } = await supabase.rpc('refresh_availability_location', {
        p_latitude: position.latitude,
        p_longitude: position.longitude,
      });

      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.nearbyRequests }),
  });
}
