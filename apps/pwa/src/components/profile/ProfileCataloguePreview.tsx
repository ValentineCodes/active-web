'use client';

import { useCatalogueMediaUrl, useUserCatalogue } from '@/features/profile/catalogue-api';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

const TILE_CLASS = 'size-32 shrink-0 overflow-hidden rounded-2xl';

function PhotoTile({ path }: { path: string }) {
  const url = useCatalogueMediaUrl(path);
  return (
    <div className={TILE_CLASS}>
      {url.data ? (
        <img src={url.data} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-surface" />
      )}
    </div>
  );
}

function VideoTile({ path }: { path: string }) {
  const colors = useColors();
  const url = useCatalogueMediaUrl(path);
  return (
    <div className={`relative ${TILE_CLASS} bg-ink`}>
      {url.data ? (
        <video src={url.data} className="absolute inset-0 h-full w-full object-cover opacity-80" muted />
      ) : null}
      <div className="absolute inset-0 flex items-center justify-center bg-ink/40">
        <IonIcon icon={ionIcons['play-circle-outline']} size={40} color={colors.canvas} />
      </div>
    </div>
  );
}

/** Read-only catalogue rail for profile sheets (matches native). */
export function ProfileCataloguePreview({ userId }: { userId: string }) {
  const catalogue = useUserCatalogue(userId);

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

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {video ? <VideoTile path={video.storage_path} /> : null}
      {photos.map((photo) => (
        <PhotoTile key={photo.id} path={photo.storage_path} />
      ))}
    </div>
  );
}