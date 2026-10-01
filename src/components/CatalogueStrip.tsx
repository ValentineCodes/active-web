import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { CatalogueViewer } from '@/components/CatalogueViewer';
import { useCatalogueMediaUrl, useUserCatalogue } from '@/features/profile/catalogue-api';
import { ErrorState } from '@/components/ui/StateView';
import { useColors } from '@/theme';

function CatalogueThumb({
  path,
  kind,
  onPress,
}: {
  path: string;
  kind: 'photo' | 'video';
  onPress: () => void;
}) {
  const colors = useColors();
  const url = useCatalogueMediaUrl(path);

  if (url.isPending) {
    return (
      <View className="h-24 w-32 items-center justify-center rounded-2xl bg-surface">
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (url.isError || !url.data) {
    return (
      <View className="h-24 w-32 items-center justify-center rounded-2xl bg-surface">
        <Ionicons name="image-outline" size={22} color={colors.muted} />
      </View>
    );
  }

  if (kind === 'video') {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Play profile video"
        className="h-24 w-32 items-center justify-center overflow-hidden rounded-2xl bg-ink"
      >
        <Ionicons name="play-circle" size={36} color={colors.canvas} />
        <Text className="mt-1 text-xs font-medium text-canvas/80">Video</Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="View profile photo">
      <Image
        source={{ uri: url.data }}
        style={{ width: 128, height: 96, borderRadius: 16 }}
        contentFit="cover"
      />
    </Pressable>
  );
}

/**
 * Read-only optional photos and video on someone's profile.
 */
export function CatalogueStrip({
  userId,
  emptyLabel,
  showHeading = true,
}: {
  userId: string;
  emptyLabel?: string;
  showHeading?: boolean;
}) {
  const colors = useColors();
  const catalogue = useUserCatalogue(userId);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (catalogue.isPending) {
    return (
      <View className="h-24 items-center justify-center">
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (catalogue.isError) {
    return <ErrorState error={catalogue.error} onRetry={() => catalogue.refetch()} />;
  }

  const photos = catalogue.data.filter((row) => row.kind === 'photo');
  const video = catalogue.data.find((row) => row.kind === 'video');

  if (photos.length === 0 && !video) {
    return emptyLabel ? <Text className="text-sm text-muted">{emptyLabel}</Text> : null;
  }

  const items = [
    ...(video ? [{ path: video.storage_path, kind: 'video' as const }] : []),
    ...photos.map((photo) => ({ path: photo.storage_path, kind: 'photo' as const })),
  ];

  return (
    <View className={showHeading ? 'gap-2' : undefined}>
      {showHeading ? <Text className="text-sm font-semibold text-ink">Photos & video</Text> : null}
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, height: 96 }}
        contentContainerStyle={{ gap: 12, alignItems: 'center' }}
      >
        {video ? (
          <CatalogueThumb
            path={video.storage_path}
            kind="video"
            onPress={() => setViewerIndex(0)}
          />
        ) : null}
        {photos.map((photo, index) => (
          <CatalogueThumb
            key={photo.id}
            path={photo.storage_path}
            kind="photo"
            onPress={() => setViewerIndex(video ? index + 1 : index)}
          />
        ))}
      </ScrollView>
      {viewerIndex !== null ? (
        <CatalogueViewer
          items={items}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </View>
  );
}
