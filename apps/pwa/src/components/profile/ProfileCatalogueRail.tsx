'use client';

import { useRef } from 'react';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { InlineError } from '@/components/ui/StateView';
import { PROFILE_CATALOGUE_PHOTO_LIMIT } from '@/features/domain/model';
import {
  useAddCataloguePhoto,
  useCatalogueMediaUrl,
  useMyCatalogue,
  useSetCatalogueVideo,
} from '@/features/profile/catalogue-api';
import { useColors } from '@/theme/ThemeProvider';

function MediaPlaceholder({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: keyof typeof ionIcons;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-32 shrink-0 items-center justify-center rounded-2xl border border-hairline bg-surface active:opacity-90 disabled:opacity-50"
    >
      <IonIcon icon={ionIcons[icon]} size={28} color={colors.subtle} />
    </button>
  );
}

function PhotoTile({ path }: { path: string }) {
  const url = useCatalogueMediaUrl(path);
  return (
    <div className="size-32 shrink-0 overflow-hidden rounded-2xl bg-surface">
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
    <div className="relative flex size-32 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-ink">
      {url.data ? (
        <video src={url.data} className="absolute inset-0 h-full w-full object-cover opacity-80" muted />
      ) : null}
      <IonIcon icon={ionIcons['play-circle-outline']} size={40} color={colors.canvas} />
    </div>
  );
}

/** Own-profile catalogue — video first, then photo slots with placeholders (matches native). */
export function ProfileCatalogueRail() {
  const catalogue = useMyCatalogue();
  const addPhoto = useAddCataloguePhoto();
  const setVideo = useSetCatalogueVideo();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  if (catalogue.isPending) {
    return <div className="h-32 shrink-0" aria-hidden />;
  }

  if (catalogue.isError) {
    return <InlineError error={catalogue.error} />;
  }

  const photos = catalogue.data
    .filter((row) => row.kind === 'photo')
    .sort((a, b) => a.sort_order - b.sort_order);
  const video = catalogue.data.find((row) => row.kind === 'video');
  const photoSlotsLeft = PROFILE_CATALOGUE_PHOTO_LIMIT - photos.length;

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = event.target.files ? [...event.target.files] : [];
          event.target.value = '';
          if (files.length === 0) return;
          void addPhoto.mutateAsync(files);
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/quicktime"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          void setVideo.mutateAsync(file);
        }}
      />

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {video ? (
          <VideoTile path={video.storage_path} />
        ) : (
          <MediaPlaceholder
            icon="videocam-outline"
            label="Add video"
            disabled={setVideo.isPending}
            onClick={() => videoInputRef.current?.click()}
          />
        )}

        {photos.map((photo) => (
          <PhotoTile key={photo.id} path={photo.storage_path} />
        ))}

        {Array.from({ length: photoSlotsLeft }, (_, index) => (
          <MediaPlaceholder
            key={`empty-${index}`}
            icon="image-outline"
            label="Add photo"
            disabled={addPhoto.isPending}
            onClick={() => photoInputRef.current?.click()}
          />
        ))}
      </div>

      {addPhoto.isError ? <InlineError error={addPhoto.error} /> : null}
      {setVideo.isError ? <InlineError error={setVideo.error} /> : null}
    </div>
  );
}
