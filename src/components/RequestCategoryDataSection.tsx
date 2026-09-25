import { Image, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import {
  formatStoredCategoryData,
  photoPathsFromCategoryData,
} from '@/features/requests/category-data';
import { REQUEST_MEDIA_BUCKET } from '@/features/requests/request-media';
import { SIGNED_URL_TTL_SECONDS } from '@/features/profile/storage';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/database.types';

function useRequestMediaUrl(path: string) {
  return useQuery({
    queryKey: queryKeys.requestMediaUrl(path),
    staleTime: (SIGNED_URL_TTL_SECONDS - 300) * 1000,
    gcTime: SIGNED_URL_TTL_SECONDS * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(REQUEST_MEDIA_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

      if (error) throw error;
      return data.signedUrl;
    },
  });
}

function RequestPhoto({ path }: { path: string }) {
  const url = useRequestMediaUrl(path);

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
}: {
  categorySlug: string;
  categoryData: Json;
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
              <RequestPhoto key={path} path={path} />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
