import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { CatalogueViewer } from '@/components/CatalogueViewer';
import {
  useAddCataloguePhoto,
  useCatalogueMediaUrl,
  useMyCatalogue,
  useSetCatalogueVideo,
} from '@/features/profile/catalogue-api';
import { PROFILE_CATALOGUE_PHOTO_LIMIT } from '@/features/domain/model';
import { InlineError } from '@/components/ui/StateView';
import { useColors } from '@/theme';

const TILE_SIZE = 132;

function MediaPlaceholder({
  icon,
  label,
  onPress,
  loading,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="items-center justify-center rounded-2xl border border-hairline bg-surface active:opacity-90"
      style={{ width: TILE_SIZE, height: TILE_SIZE }}
    >
      {loading ? (
        <ActivityIndicator color={colors.active} />
      ) : (
        <Ionicons name={icon} size={28} color={colors.subtle} />
      )}
    </Pressable>
  );
}

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

/** Own-profile catalogue — video first, then photo slots with placeholders. */
export function ProfileCatalogueRail() {
  const colors = useColors();
  const catalogue = useMyCatalogue();
  const addPhoto = useAddCataloguePhoto();
  const setVideo = useSetCatalogueVideo();
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
  const photoSlotsLeft = PROFILE_CATALOGUE_PHOTO_LIMIT - photos.length;

  const viewerItems = [
    ...(video ? [{ path: video.storage_path, kind: 'video' as const }] : []),
    ...photos.map((photo) => ({ path: photo.storage_path, kind: 'photo' as const })),
  ];

  const addPhotos = () => {
    if (photoSlotsLeft <= 0) return;
    addPhoto.mutate({});
  };

  const addVideo = () => {
    setVideo.mutate({});
  };

  return (
    <View className="gap-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-3 pr-5"
      >
        {video ? (
          <VideoTile path={video.storage_path} onPress={() => setViewerIndex(0)} />
        ) : (
          <MediaPlaceholder
            icon="videocam-outline"
            label="Add video"
            onPress={addVideo}
            loading={setVideo.isPending}
          />
        )}

        {photos.map((photo, index) => (
          <PhotoTile
            key={photo.id}
            path={photo.storage_path}
            onPress={() => setViewerIndex((video ? 1 : 0) + index)}
          />
        ))}

        {Array.from({ length: photoSlotsLeft }, (_, index) => (
          <MediaPlaceholder
            key={`empty-${index}`}
            icon="image-outline"
            label="Add photo"
            onPress={addPhotos}
            loading={addPhoto.isPending}
          />
        ))}
      </ScrollView>

      {addPhoto.isError ? <InlineError error={addPhoto.error} /> : null}
      {setVideo.isError ? <InlineError error={setVideo.error} /> : null}

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
