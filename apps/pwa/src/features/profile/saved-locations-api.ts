import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Position } from '@/lib/geolocation';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import type { RpcRow } from '@/lib/supabase/types';

type Functions = Database['public']['Functions'];

export const MAX_SAVED_LOCATIONS = 5;

export type SavedLocation = RpcRow<Functions['list_my_saved_locations']['Returns']>;

export function useMySavedLocations() {
  return useQuery({
    queryKey: queryKeys.savedLocations,
    queryFn: async (): Promise<SavedLocation[]> => {
      const { data, error } = await supabase.rpc('list_my_saved_locations');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertSavedLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      savedLocationId?: string | null;
      alias?: string | null;
      locationLabel: string;
      position: Position;
      isDefault?: boolean;
    }) => {
      const { data, error } = await supabase.rpc('upsert_saved_location', {
        p_saved_location_id: input.savedLocationId ?? null,
        p_alias: input.alias ?? null,
        p_location_label: input.locationLabel,
        p_latitude: input.position.latitude,
        p_longitude: input.position.longitude,
        p_is_default: input.isDefault ?? false,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savedLocations });
    },
  });
}

export function useDeleteSavedLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (savedLocationId: string) => {
      const { error } = await supabase.rpc('delete_saved_location', {
        p_saved_location_id: savedLocationId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savedLocations });
    },
  });
}

export function useTouchSavedLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (savedLocationId: string) => {
      const { error } = await supabase.rpc('touch_saved_location', {
        p_saved_location_id: savedLocationId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savedLocations });
    },
  });
}

export function savedLocationPosition(row: SavedLocation): Position {
  return { latitude: row.latitude, longitude: row.longitude };
}

export function savedLocationDisplayTitle(row: SavedLocation): string {
  const alias = row.alias?.trim();
  if (alias) return alias;
  return row.location_label;
}
