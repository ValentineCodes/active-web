import { MediaViewer } from '@/components/media/MediaViewer';
import { attachmentToMediaItem, type MediaViewerItem } from '@/components/media/media-viewer-types';
import type { RequestMessageAttachment } from '@/features/requests/conversation-message-model';

export function ConversationImageGalleryViewer({
  attachments,
  initialIndex,
  onClose,
}: {
  attachments: RequestMessageAttachment[];
  initialIndex: number;
  onClose: () => void;
}) {
  const items = attachments.map(attachmentToMediaItem);
  return <MediaViewer items={items} initialIndex={initialIndex} onClose={onClose} />;
}

export function ConversationAttachmentViewer({
  visible,
  kind,
  signedUrl,
  accessibilityLabel,
  onClose,
}: {
  visible: boolean;
  kind: 'image' | 'video';
  signedUrl: string | null;
  accessibilityLabel: string;
  onClose: () => void;
}) {
  if (!visible || !signedUrl) return null;

  const items: MediaViewerItem[] = [
    {
      id: 'conversation-attachment',
      path: signedUrl,
      uri: signedUrl,
      kind: kind === 'video' ? 'video' : 'photo',
      accessibilityLabel,
    },
  ];

  return <MediaViewer items={items} initialIndex={0} onClose={onClose} />;
}