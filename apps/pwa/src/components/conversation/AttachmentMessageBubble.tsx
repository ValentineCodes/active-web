'use client';

import { useCallback, useState } from 'react';

import { ConversationAttachmentUploadOverlay } from '@/components/conversation/ConversationComposerAttachmentPreview';
import { ConversationImageCountBadge } from '@/components/conversation/ConversationImageCountBadge';
import { FileAttachmentRow } from '@/components/conversation/FileAttachmentRow';
import { ConversationAttachmentViewer, ConversationImageGalleryViewer } from '@/components/conversation/ConversationMediaViewer';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import type {
  RequestMessage,
  RequestMessageAttachment,
} from '@/features/requests/conversation-message-model';
import type { ConversationAttachmentUploadState } from '@/features/requests/conversation-attachment-upload-state';
import { useConversationAttachmentUrl } from '@/features/requests/conversation-attachment-url';
import { cn } from '@/lib/cn';
import { showAppToast } from '@/lib/toast';

const THUMB_WIDTH = 224;
const THUMB_HEIGHT = 168;

function partitionMessageAttachments(attachments: RequestMessageAttachment[]) {
  const images: RequestMessageAttachment[] = [];
  const rest: RequestMessageAttachment[] = [];
  for (const attachment of attachments) {
    if (attachment.attachmentType === 'image') {
      images.push(attachment);
    } else {
      rest.push(attachment);
    }
  }
  return { images, rest };
}

function galleryUploadState(
  images: RequestMessageAttachment[],
  uploadStateByAttachmentId?: Record<string, ConversationAttachmentUploadState>,
): ConversationAttachmentUploadState | undefined {
  for (const attachment of images) {
    const state = uploadStateByAttachmentId?.[attachment.id];
    if (state && state.phase !== 'idle' && state.phase !== 'uploaded') {
      return state;
    }
  }
  return undefined;
}

function attachmentAccessibilityLabel(attachment: RequestMessageAttachment): string {
  if (attachment.fileName) return attachment.fileName;
  if (attachment.attachmentType === 'image') return 'Image attachment';
  if (attachment.attachmentType === 'video') return 'Video attachment';
  return 'File attachment';
}

function ImageGalleryStack({
  images,
  upload,
}: {
  images: RequestMessageAttachment[];
  upload?: ConversationAttachmentUploadState;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const lead = images[0];
  const hasStorage = Boolean(lead && lead.storagePath.length > 0);
  const localPreviewUri = lead?.localPreviewUri;
  const signedUrl = useConversationAttachmentUrl(hasStorage && lead ? lead.storagePath : null);

  const resolvedThumbUri =
    signedUrl.data ??
    (localPreviewUri && (signedUrl.isPending || signedUrl.isError) ? localPreviewUri : null);

  const openGallery = useCallback(() => {
    if (!resolvedThumbUri && signedUrl.isPending) return;
    if (!resolvedThumbUri) return;
    setViewerOpen(true);
  }, [resolvedThumbUri, signedUrl.isPending]);

  if (!lead) return null;

  if (!resolvedThumbUri) {
    if (signedUrl.isPending) {
      return (
        <div
          className="flex items-center justify-center bg-surface"
          style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
        >
          <span
            className="h-6 w-6 animate-spin rounded-full border-2 border-subtle border-t-transparent"
            aria-label="Loading attachment"
          />
        </div>
      );
    }
    return (
      <div
        className="flex items-center justify-center bg-surface px-3 text-center text-sm text-muted"
        style={{ width: THUMB_WIDTH, minHeight: 72 }}
      >
        Could not load this attachment.
      </div>
    );
  }

  const countLabel = String(images.length);
  const showUploadOverlay = Boolean(upload && upload.phase !== 'idle' && upload.phase !== 'uploaded');

  return (
    <>
      <button
        type="button"
        aria-label={`View ${countLabel} photos`}
        onClick={openGallery}
        className="relative overflow-hidden bg-surface active:opacity-95"
        style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
      >
        <img
          src={resolvedThumbUri}
          alt=""
          className="h-full w-full object-cover"
          width={THUMB_WIDTH}
          height={THUMB_HEIGHT}
        />
        <ConversationImageCountBadge count={images.length} className="absolute bottom-2 right-2" />
        {showUploadOverlay ? (
          <ConversationAttachmentUploadOverlay upload={upload} canRemove={false} />
        ) : null}
      </button>
      {viewerOpen ? (
        <ConversationImageGalleryViewer
          attachments={images}
          initialIndex={0}
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </>
  );
}

function AttachmentTile({
  attachment,
  isOutgoing,
  upload,
}: {
  attachment: RequestMessageAttachment;
  isOutgoing: boolean;
  upload?: ConversationAttachmentUploadState;
}) {
  const hasStorage = attachment.storagePath.length > 0;
  const localPreviewUri = attachment.localPreviewUri;
  const signedUrl = useConversationAttachmentUrl(hasStorage ? attachment.storagePath : null);
  const label = attachmentAccessibilityLabel(attachment);
  const [viewerOpen, setViewerOpen] = useState(false);
  const showUploadOverlay = Boolean(upload && upload.phase !== 'idle' && upload.phase !== 'uploaded');

  const resolvedUri =
    signedUrl.data ??
    (localPreviewUri && (signedUrl.isPending || signedUrl.isError) ? localPreviewUri : null);

  const openFile = useCallback(() => {
    if (!signedUrl.data) return;
    try {
      window.open(signedUrl.data, '_blank', 'noopener,noreferrer');
    } catch {
      showAppToast('Could not open this file.', { type: 'warning' });
    }
  }, [signedUrl.data]);

  if (attachment.attachmentType === 'file') {
    if (!hasStorage && localPreviewUri) {
      return (
        <div className="relative w-full self-stretch">
          <FileAttachmentRow
            fileName={attachment.fileName ?? 'File'}
            fileSize={attachment.fileSize}
            isOutgoing={isOutgoing}
            onOpen={() => {}}
            disabled
            minWidth={THUMB_WIDTH}
          />
          {showUploadOverlay ? (
            <ConversationAttachmentUploadOverlay upload={upload} canRemove={false} />
          ) : null}
        </div>
      );
    }

    if (!hasStorage) {
      return (
        <div
          className="flex items-center justify-center bg-surface"
          style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
        >
          <span
            className="h-6 w-6 animate-spin rounded-full border-2 border-subtle border-t-transparent"
            aria-label="Loading attachment"
          />
        </div>
      );
    }

    if (signedUrl.isPending && !signedUrl.data) {
      return (
        <div
          className="flex items-center justify-center bg-surface"
          style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
        >
          <span
            className="h-6 w-6 animate-spin rounded-full border-2 border-subtle border-t-transparent"
            aria-label="Loading attachment"
          />
        </div>
      );
    }

    if (!signedUrl.data) {
      return (
        <div
          className="flex items-center justify-center bg-surface px-3 text-center text-sm text-muted"
          style={{ width: THUMB_WIDTH, minHeight: 72 }}
        >
          Could not load this attachment.
        </div>
      );
    }

    return (
      <FileAttachmentRow
        fileName={attachment.fileName ?? 'File'}
        fileSize={attachment.fileSize}
        isOutgoing={isOutgoing}
        onOpen={openFile}
        minWidth={THUMB_WIDTH}
      />
    );
  }

  if (attachment.attachmentType === 'image') {
    if (!resolvedUri) {
      if (signedUrl.isPending) {
        return (
          <div
            className="flex items-center justify-center bg-surface"
            style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
          >
            <span
              className="h-6 w-6 animate-spin rounded-full border-2 border-subtle border-t-transparent"
              aria-label="Loading attachment"
            />
          </div>
        );
      }
      return (
        <div
          className="flex items-center justify-center bg-surface px-3 text-center text-sm text-muted"
          style={{ width: THUMB_WIDTH, minHeight: 72 }}
        >
          Could not load this attachment.
        </div>
      );
    }

    const viewerUri = signedUrl.data ?? resolvedUri;

    return (
      <>
        <button
          type="button"
          aria-label={`View ${label}`}
          onClick={() => setViewerOpen(true)}
          className="relative overflow-hidden bg-surface active:opacity-95"
          style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
        >
          <img src={resolvedUri} alt="" className="h-full w-full object-cover" />
          {showUploadOverlay ? (
            <ConversationAttachmentUploadOverlay upload={upload} canRemove={false} />
          ) : null}
        </button>
        {viewerOpen ? (
          <ConversationAttachmentViewer
            visible
            kind="image"
            signedUrl={viewerUri}
            accessibilityLabel={label}
            onClose={() => setViewerOpen(false)}
          />
        ) : null}
      </>
    );
  }

  if (attachment.attachmentType === 'video') {
    if (!hasStorage && !localPreviewUri) {
      return (
        <div
          className="flex items-center justify-center bg-surface"
          style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
        >
          <span
            className="h-6 w-6 animate-spin rounded-full border-2 border-subtle border-t-transparent"
            aria-label="Loading attachment"
          />
        </div>
      );
    }

    if (!resolvedUri) {
      if (signedUrl.isPending) {
        return (
          <div
            className="flex items-center justify-center bg-surface"
            style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
          >
            <span
              className="h-6 w-6 animate-spin rounded-full border-2 border-subtle border-t-transparent"
              aria-label="Loading attachment"
            />
          </div>
        );
      }
      return (
        <div
          className="flex items-center justify-center bg-surface px-3 text-center text-sm text-muted"
          style={{ width: THUMB_WIDTH, minHeight: 72 }}
        >
          Could not load this attachment.
        </div>
      );
    }

    const viewerUri = signedUrl.data ?? resolvedUri;

    return (
      <>
        <button
          type="button"
          aria-label={`Play ${label}`}
          onClick={() => setViewerOpen(true)}
          className="relative overflow-hidden bg-surface active:opacity-95"
          style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
        >
          <video src={resolvedUri} muted playsInline className="h-full w-full object-cover" preload="metadata" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/25">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 pl-0.5">
              <IonIcon icon={ionIcons.play} size={26} color="#ffffff" />
            </span>
          </span>
          {showUploadOverlay ? (
            <ConversationAttachmentUploadOverlay upload={upload} canRemove={false} />
          ) : null}
        </button>
        {viewerOpen ? (
          <ConversationAttachmentViewer
            visible
            kind="video"
            signedUrl={viewerUri}
            accessibilityLabel={label}
            onClose={() => setViewerOpen(false)}
          />
        ) : null}
      </>
    );
  }

  return null;
}

export function AttachmentMessageBubble({
  message,
  isOutgoing,
  uploadStateByAttachmentId,
}: {
  message: RequestMessage;
  isOutgoing: boolean;
  uploadStateByAttachmentId?: Record<string, ConversationAttachmentUploadState>;
}) {
  const attachments = message.attachments;
  const { images, rest } = partitionMessageAttachments(attachments);
  const useImageGallery = images.length > 1;
  const body = message.body.trim();
  const hasBody = body.length > 0;

  if (attachments.length === 0 && !hasBody) {
    return null;
  }

  return (
    <div
      className={cn(
        'w-max max-w-full overflow-hidden rounded-2xl',
        isOutgoing ? 'rounded-br-md bg-active' : 'rounded-bl-md border border-hairline bg-elevated',
      )}
    >
        {attachments.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {useImageGallery ? (
              <ImageGalleryStack
                images={images}
                upload={galleryUploadState(images, uploadStateByAttachmentId)}
              />
            ) : (
              images.map((attachment) => (
                <AttachmentTile
                  key={attachment.id}
                  attachment={attachment}
                  isOutgoing={isOutgoing}
                  upload={uploadStateByAttachmentId?.[attachment.id]}
                />
              ))
            )}
            {rest.map((attachment) => (
              <AttachmentTile
                key={attachment.id}
                attachment={attachment}
                isOutgoing={isOutgoing}
                upload={uploadStateByAttachmentId?.[attachment.id]}
              />
            ))}
          </div>
        ) : null}
        {hasBody ? (
          <p className={cn('px-4 py-2.5 text-base leading-6', isOutgoing ? 'text-on-brand' : 'text-ink')}>
            {body}
          </p>
        ) : null}
    </div>
  );
}