import { CatalogueViewer, type CatalogueViewerItem } from '@/components/CatalogueViewer';
import type { RequestMessageAttachment } from '@/features/requests/conversation-message-model';

function attachmentToCatalogueItem(attachment: RequestMessageAttachment): CatalogueViewerItem {
  return {
    id: attachment.id,
    path: attachment.storagePath,
    kind: attachment.attachmentType === 'video' ? 'video' : 'photo',
    storage: 'conversation',
    localPreviewUri: attachment.localPreviewUri,
    accessibilityLabel: attachment.fileName ?? undefined,
  };
}

export function ConversationImageGalleryViewer({
  attachments,
  initialIndex,
  onClose,
}: {
  attachments: RequestMessageAttachment[];
  initialIndex: number;
  onClose: () => void;
}) {
  const items = attachments.map(attachmentToCatalogueItem);

  return <CatalogueViewer items={items} initialIndex={initialIndex} onClose={onClose} />;
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

  const items: CatalogueViewerItem[] = [
    {
      id: 'conversation-attachment',
      path: signedUrl,
      uri: signedUrl,
      kind: kind === 'video' ? 'video' : 'photo',
      accessibilityLabel,
    },
  ];

  return <CatalogueViewer items={items} initialIndex={0} onClose={onClose} />;
}
