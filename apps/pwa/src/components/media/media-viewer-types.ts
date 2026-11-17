import type { CatalogueRow } from '@/features/profile/catalogue-api';
import type { RequestMessageAttachment } from '@/features/requests/conversation-message-model';

export type MediaViewerItem = {
  id?: string;
  path: string;
  kind: 'photo' | 'video';
  storage?: 'catalogue' | 'avatar' | 'conversation' | 'request';
  /** When set, loads this URI instead of resolving `path` from storage. */
  uri?: string;
  localPreviewUri?: string;
  accessibilityLabel?: string;
};

export function catalogueRowsToMediaItems(rows: CatalogueRow[]): MediaViewerItem[] {
  const video = rows.find((row) => row.kind === 'video');
  const photos = rows
    .filter((row) => row.kind === 'photo')
    .sort((a, b) => a.sort_order - b.sort_order);

  return [
    ...(video
      ? [
          {
            id: video.id,
            path: video.storage_path,
            kind: 'video' as const,
            storage: 'catalogue' as const,
          },
        ]
      : []),
    ...photos.map((photo) => ({
      id: photo.id,
      path: photo.storage_path,
      kind: 'photo' as const,
      storage: 'catalogue' as const,
    })),
  ];
}

export function attachmentToMediaItem(attachment: RequestMessageAttachment): MediaViewerItem {
  return {
    id: attachment.id,
    path: attachment.storagePath,
    kind: attachment.attachmentType === 'video' ? 'video' : 'photo',
    storage: 'conversation',
    localPreviewUri: attachment.localPreviewUri,
    accessibilityLabel: attachment.fileName ?? undefined,
  };
}