import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { CatalogueViewer } from '@/components/CatalogueViewer';
import { useCatalogueMediaUrl, useUserCatalogue } from '@/features/profile/catalogue-api';
import { InlineError } from '@/components/ui/StateView';
import { useColors } from '@/theme';

const TILE_SIZE = 132;

function PhotoTile({ path, onPress }: { path: string; onPress: () => void }) {
  const colors = useColors();
  const url = useCatalogueMediaUrl(path);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="View photo"
      className="overflow-hidden rounded-2xl bg-surface active:opacity-90"
      style={{ width: TILE_SIZE, height: TILE_SIZE }}
    >
      {url.data ? (
        <Image
          source={{ uri: url.data }}
          style={{ width: TILE_SIZE, height: TILE_SIZE }}
          contentFit="cover"
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.active} />
        </View>
      )}
    </Pressable>
  );
}

function VideoTile({ path, onPress }: { path: string; onPress: () => void }) {
  const colors = useColors();
  const url = useCatalogueMediaUrl(path);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Play profile video"
      className="items-center justify-center overflow-hidden rounded-2xl bg-ink active:opacity-90"
      style={{ width: TILE_SIZE, height: TILE_SIZE }}
    >
      {url.data ? (
        <Image
          source={{ uri: url.data }}
          style={{ width: TILE_SIZE, height: TILE_SIZE }}
          contentFit="cover"
        />
      ) : null}
      <View className="absolute inset-0 items-center justify-center bg-ink/40">
        <Ionicons name="play-circle" size={40} color={colors.canvas} />
      </View>
    </Pressable>
  );
}

/** Read-only catalogue rail for profile previews (matches request_7 tiles). */
export function ProfileCataloguePreview({ userId }: { userId: string }) {
  const colors = useColors();
  const catalogue = useUserCatalogue(userId);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (catalogue.isPending) {
    return (
      <View className="h-36 items-center justify-center">
        <ActivityIndicator color={colors.active} />
      </View>
    );
  }

  if (catalogue.isError) {
    return <InlineError error={catalogue.error} />;
  }

  const photos = catalogue.data
    .filter((row) => row.kind === 'photo')
    .sort((a, b) => a.sort_order - b.sort_order);
  const video = catalogue.data.find((row) => row.kind === 'video');

  if (photos.length === 0 && !video) {
    return null;
  }

  const viewerItems = [
    ...(video ? [{ path: video.storage_path, kind: 'video' as const }] : []),
    ...photos.map((photo) => ({ path: photo.storage_path, kind: 'photo' as const })),
  ];

  return (
    <View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, height: TILE_SIZE }}
        contentContainerClassName="gap-3"
      >
        {video ? <VideoTile path={video.storage_path} onPress={() => setViewerIndex(0)} /> : null}
        {photos.map((photo, index) => (
          <PhotoTile
            key={photo.id}
            path={photo.storage_path}
            onPress={() => setViewerIndex((video ? 1 : 0) + index)}
          />
        ))}
      </ScrollView>

      {viewerIndex !== null ? (
        <CatalogueViewer
          items={viewerItems}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </View>
  );
}
