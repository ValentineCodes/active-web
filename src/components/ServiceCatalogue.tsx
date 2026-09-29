import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { CatalogueViewer } from '@/components/CatalogueViewer';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { InlineError } from '@/components/ui/StateView';
import {
  catalogueCounts,
  catalogueLimitsLabel,
  useAddCataloguePhoto,
  useCatalogueMediaUrl,
  useMyCatalogue,
  useRemoveCatalogueMedia,
  useRemoveCatalogueVideo,
  useSetCatalogueVideo,
} from '@/features/profile/catalogue-api';
import {
  PROFILE_CATALOGUE_PHOTO_LIMIT,
  PROFILE_CATALOGUE_VIDEO_LIMIT,
} from '@/features/domain/model';
import { colors } from '@/theme';

function UploadProgress({ label, progress }: { label: string; progress: number | null }) {
  if (progress === null) return null;

  return (
    <View className="gap-2 rounded-2xl bg-surface p-3">
      <Text className="text-sm text-muted">{label}</Text>
      <View className="h-2 overflow-hidden rounded-full bg-canvas">
        <View
          className="h-full rounded-full bg-brand"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </View>
    </View>
  );
}

function CataloguePhotoTile({
  path,
  onOpen,
  onRemove,
}: {
  path: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const url = useCatalogueMediaUrl(path);

  return (
    <View className="w-40">
      <View className="relative overflow-hidden rounded-2xl bg-surface">
        {url.data ? (
          <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="View photo">
            <Image
              source={{ uri: url.data }}
              style={{ width: 160, height: 128 }}
              contentFit="cover"
            />
          </Pressable>
        ) : (
          <View className="h-32 w-40 items-center justify-center">
            {url.isPending ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Ionicons name="image-outline" size={28} color={colors.muted} />
            )}
          </View>
        )}
        <View className="absolute right-2 top-2">
          <IconButton icon="trash-outline" accessibilityLabel="Remove photo" onPress={onRemove} />
        </View>
      </View>
    </View>
  );
}

function CatalogueVideoTile({
  onOpen,
  onReplace,
  onRemove,
  replaceLoading,
  removeLoading,
}: {
  onOpen: () => void;
  onReplace: () => void;
  onRemove: () => void;
  replaceLoading: boolean;
  removeLoading: boolean;
}) {
  return (
    <View className="gap-3 rounded-2xl bg-surface p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-ink">
          <Ionicons name="videocam" size={26} color={colors.canvas} />
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-base font-semibold text-ink">Profile video</Text>
          <Text className="text-sm text-muted">Replace or remove your clip any time.</Text>
        </View>
      </View>
      <View className="flex-row gap-3">
        <Button label="View" variant="secondary" className="flex-1" onPress={onOpen} />
        <Button
          label="Replace"
          variant="secondary"
          className="flex-1"
          loading={replaceLoading}
          onPress={onReplace}
        />
        <Button
          label="Remove"
          variant="danger"
          className="flex-1"
          loading={removeLoading}
          onPress={onRemove}
        />
      </View>
    </View>
  );
}

/** Optional photos and video on your profile — never required to join a request. */
export function ProfileMediaSection() {
  const catalogue = useMyCatalogue();
  const addPhoto = useAddCataloguePhoto();
  const removeMedia = useRemoveCatalogueMedia();
  const setVideo = useSetCatalogueVideo();
  const removeVideo = useRemoveCatalogueVideo();

  const [photoProgress, setPhotoProgress] = useState<number | null>(null);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [skippedNote, setSkippedNote] = useState<string | null>(null);

  if (catalogue.isPending) {
    return (
      <Card className="items-center py-8">
        <ActivityIndicator color={colors.brand} />
        <Text className="mt-3 text-sm text-muted">Loading your catalogue…</Text>
      </Card>
    );
  }

  if (catalogue.isError) {
    return (
      <Card className="gap-3">
        <InlineError error={catalogue.error} />
        <Button label="Try again" variant="secondary" onPress={() => catalogue.refetch()} />
      </Card>
    );
  }

  const photos = catalogue.data
    .filter((row) => row.kind === 'photo')
    .sort((a, b) => a.sort_order - b.sort_order);
  const video = catalogue.data.find((row) => row.kind === 'video');
  const { photos: photoCount, videos: videoCount } = catalogueCounts(catalogue.data);
  const atPhotoLimit = photoCount >= PROFILE_CATALOGUE_PHOTO_LIMIT;
  const atVideoLimit = videoCount >= PROFILE_CATALOGUE_VIDEO_LIMIT;

  const viewerItems = [
    ...photos.map((photo) => ({ path: photo.storage_path, kind: 'photo' as const })),
    ...(video ? [{ path: video.storage_path, kind: 'video' as const }] : []),
  ];

  const runPhotoUpload = () => {
    setPhotoProgress(0);
    setSkippedNote(null);
    addPhoto.mutate(
      { onProgress: setPhotoProgress },
      {
        onSettled: () => setPhotoProgress(null),
        onSuccess: (result) => {
          if (result && result.skipped.length > 0) setSkippedNote(result.skipped.join(' '));
        },
      },
    );
  };

  const runVideoUpload = () => {
    setVideoProgress(0);
    setVideo.mutate({ onProgress: setVideoProgress }, { onSettled: () => setVideoProgress(null) });
  };

  return (
    <Card className="gap-4">
      <View className="gap-1">
        <Text className="text-lg font-bold text-ink">Photos & video (optional)</Text>
        <Text className="text-base text-muted">{catalogueLimitsLabel()}</Text>
      </View>

      <View className="gap-3">
        <Text className="text-base font-semibold text-ink">
          Photos ({photoCount}/{PROFILE_CATALOGUE_PHOTO_LIMIT})
        </Text>

        {photos.length === 0 ? (
          <Text className="text-sm text-muted">No photos yet — add a few if you like.</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-3"
          >
            {photos.map((photo, index) => (
              <CataloguePhotoTile
                key={photo.id}
                path={photo.storage_path}
                onOpen={() => setViewerIndex(index)}
                onRemove={() => removeMedia.mutate(photo.id)}
              />
            ))}
          </ScrollView>
        )}

        <UploadProgress label="Uploading photos…" progress={photoProgress} />
        {addPhoto.isError ? <InlineError error={addPhoto.error} /> : null}
        {skippedNote ? <Text className="text-sm text-muted">{skippedNote}</Text> : null}

        <Button
          label={atPhotoLimit ? 'Photo limit reached' : 'Add photos'}
          variant="secondary"
          disabled={atPhotoLimit}
          loading={addPhoto.isPending}
          onPress={runPhotoUpload}
        />
      </View>

      <View className="gap-3">
        <Text className="text-base font-semibold text-ink">
          Video ({videoCount}/{PROFILE_CATALOGUE_VIDEO_LIMIT})
        </Text>

        {video ? (
          <CatalogueVideoTile
            onOpen={() => setViewerIndex(photos.length)}
            onReplace={runVideoUpload}
            onRemove={() => removeVideo.mutate()}
            replaceLoading={setVideo.isPending}
            removeLoading={removeVideo.isPending}
          />
        ) : (
          <>
            <Text className="text-sm text-muted">
              Optional — a short clip can help people recognise you.
            </Text>
            <UploadProgress label="Uploading video…" progress={videoProgress} />
            {setVideo.isError ? <InlineError error={setVideo.error} /> : null}
            <Button
              label={atVideoLimit ? 'Video limit reached' : 'Add video'}
              variant="secondary"
              loading={setVideo.isPending}
              onPress={runVideoUpload}
            />
          </>
        )}
      </View>

      {removeMedia.isError ? <InlineError error={removeMedia.error} /> : null}
      {removeVideo.isError ? <InlineError error={removeVideo.error} /> : null}

      {viewerIndex !== null ? (
        <CatalogueViewer
          items={viewerItems}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </Card>
  );
}

/** @deprecated Use ProfileMediaSection */
export const ServiceCatalogue = ProfileMediaSection;
