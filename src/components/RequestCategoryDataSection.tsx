import { Image, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import {
  formatStoredCategoryData,
  photoPathsFromCategoryData,
} from '@/features/requests/category-data';
import { REQUEST_MEDIA_BUCKET } from '@/features/requests/request-media';
import { SIGNED_URL_TTL_SECONDS } from '@/features/profile/storage';
import type { Position } from '@/lib/location';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/database.types';

function useRequestMediaUrl(path: string, discoveryPosition: Position | null) {
  return useQuery({
    queryKey: [
      ...queryKeys.requestMediaUrl(path),
      discoveryPosition?.latitude ?? null,
      discoveryPosition?.longitude ?? null,
    ],
    staleTime: (SIGNED_URL_TTL_SECONDS - 300) * 1000,
    gcTime: SIGNED_URL_TTL_SECONDS * 1000,
    queryFn: async () => {
      if (discoveryPosition) {
        const { error: accessError } = await supabase.rpc('authorize_request_media_read', {
          p_path: path,
          p_latitude: discoveryPosition.latitude,
          p_longitude: discoveryPosition.longitude,
        });
        if (accessError) throw accessError;
      }

      const { data, error } = await supabase.storage
        .from(REQUEST_MEDIA_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

      if (error) throw error;
      return data.signedUrl;
    },
  });
}

function RequestPhoto({
  path,
  discoveryPosition,
}: {
  path: string;
  discoveryPosition: Position | null;
}) {
  const url = useRequestMediaUrl(path, discoveryPosition);

  if (url.isPending) {
    return <View className="h-20 w-20 rounded-xl bg-surface" />;
  }

  if (url.isError || !url.data) {
    return null;
  }

  return (
    <Image
      source={{ uri: url.data }}
      className="h-20 w-20 rounded-xl"
      accessibilityLabel="Request photo"
    />
  );
}

export function RequestCategoryDataSection({
  categorySlug,
  categoryData,
  discoveryPosition = null,
}: {
  categorySlug: string;
  categoryData: Json;
  /** Set on public discovery so job photos can be signed without opening the bucket. */
  discoveryPosition?: Position | null;
}) {
  const lines = formatStoredCategoryData(categorySlug, categoryData);
  const photoPaths = photoPathsFromCategoryData(categoryData);

  if (lines.length === 0 && photoPaths.length === 0) {
    return null;
  }

  return (
    <View className="gap-2 border-t border-hairline pt-3">
      {lines.length > 0 ? (
        <View className="gap-1">
          {lines.map((line) => (
            <Text key={line.label} className="text-sm text-muted">
              <Text className="font-semibold text-ink">{line.label}: </Text>
              {line.value}
            </Text>
          ))}
        </View>
      ) : null}

      {photoPaths.length > 0 ? (
        <View className="gap-2">
          <Text className="text-sm font-semibold text-ink">Photos</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            {photoPaths.map((path) => (
              <RequestPhoto key={path} path={path} discoveryPosition={discoveryPosition} />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
