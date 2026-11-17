'use client';

import { useState } from 'react';

import { MediaViewer } from '@/components/media/MediaViewer';
import { catalogueRowsToMediaItems } from '@/components/media/media-viewer-types';
import { useCatalogueMediaUrl, useUserCatalogue } from '@/features/profile/catalogue-api';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

const TILE_CLASS = 'size-32 shrink-0 overflow-hidden rounded-2xl';

function PhotoTile({ path, onPress }: { path: string; onPress: () => void }) {
  const url = useCatalogueMediaUrl(path);
  return (
    <button
      type="button"
      aria-label="View photo"
      onClick={onPress}
      className={`${TILE_CLASS} active:opacity-90`}
    >
      {url.data ? (
        <img src={url.data} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-surface" />
      )}
    </button>
  );
}

function VideoTile({ path, onPress }: { path: string; onPress: () => void }) {
  const colors = useColors();
  const url = useCatalogueMediaUrl(path);
  return (
    <button
      type="button"
      aria-label="Play profile video"
      onClick={onPress}
      className={`relative ${TILE_CLASS} bg-ink active:opacity-90`}
    >
      {url.data ? (
        <video src={url.data} className="absolute inset-0 h-full w-full object-cover opacity-80" muted />
      ) : null}
      <div className="absolute inset-0 flex items-center justify-center bg-ink/40">
        <IonIcon icon={ionIcons['play-circle-outline']} size={40} color={colors.canvas} />
      </div>
    </button>
  );
}

/** Read-only catalogue rail for profile sheets (matches native). */
export function ProfileCataloguePreview({ userId }: { userId: string }) {
  const catalogue = useUserCatalogue(userId);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (catalogue.isPending || catalogue.isError) {
    return null;
  }

  const photos = catalogue.data
    .filter((row) => row.kind === 'photo')
    .sort((a, b) => a.sort_order - b.sort_order);
  const video = catalogue.data.find((row) => row.kind === 'video');

  if (photos.length === 0 && !video) {
    return null;
  }

  const viewerItems = catalogueRowsToMediaItems(catalogue.data);

  return (
    <>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {video ? <VideoTile path={video.storage_path} onPress={() => setViewerIndex(0)} /> : null}
        {photos.map((photo, index) => (
          <PhotoTile
            key={photo.id}
            path={photo.storage_path}
            onPress={() => setViewerIndex((video ? 1 : 0) + index)}
          />
        ))}
      </div>
      {viewerIndex !== null ? (
        <MediaViewer
          items={viewerItems}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </>
  );
}