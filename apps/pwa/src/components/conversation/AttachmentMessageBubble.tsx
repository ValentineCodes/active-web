'use client';

import { useCallback, useState } from 'react';

import { ConversationAttachmentViewer, ConversationImageGalleryViewer } from '@/components/conversation/ConversationMediaViewer';
import type {
  RequestMessage,
  RequestMessageAttachment,
} from '@/features/requests/conversation-message-model';
import { useConversationAttachmentUrl } from '@/features/requests/conversation-attachment-url';
import { cn } from '@/lib/cn';

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

function attachmentAccessibilityLabel(attachment: RequestMessageAttachment): string {
  if (attachment.fileName) return attachment.fileName;
  if (attachment.attachmentType === 'image') return 'Image attachment';
  if (attachment.attachmentType === 'video') return 'Video attachment';
  return 'File attachment';
}

function ImageGalleryStack({ images }: { images: RequestMessageAttachment[] }) {
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
        {images.length > 1 ? (
          <span className="absolute bottom-2 right-2 flex min-h-6 min-w-6 items-center justify-center rounded-md bg-black/60 px-1.5 text-lg font-semibold leading-5 text-white">
            {countLabel}
          </span>
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
}: {
  attachment: RequestMessageAttachment;
  isOutgoing: boolean;
}) {
  const hasStorage = attachment.storagePath.length > 0;
  const localPreviewUri = attachment.localPreviewUri;
  const signedUrl = useConversationAttachmentUrl(hasStorage ? attachment.storagePath : null);
  const label = attachmentAccessibilityLabel(attachment);
  const [viewerOpen, setViewerOpen] = useState(false);

  const resolvedUri = signedUrl.data ?? localPreviewUri ?? null;

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

    return (
      <>
        <button
          type="button"
          aria-label={label}
          onClick={() => setViewerOpen(true)}
          className="overflow-hidden bg-surface active:opacity-95"
          style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
        >
          <img src={resolvedUri} alt="" className="h-full w-full object-cover" />
        </button>
        {viewerOpen ? (
          <ConversationAttachmentViewer
            visible
            kind="image"
            signedUrl={resolvedUri}
            accessibilityLabel={label}
            onClose={() => setViewerOpen(false)}
          />
        ) : null}
      </>
    );
  }

  if (attachment.attachmentType === 'video') {
    if (!resolvedUri) {
      return (
        <div
          className="flex items-center justify-center bg-surface px-3 text-sm text-muted"
          style={{ width: THUMB_WIDTH, minHeight: 72 }}
        >
          {signedUrl.isPending ? 'Loading video…' : 'Could not load video.'}
        </div>
      );
    }
    return (
      <>
        <button
          type="button"
          aria-label={label}
          onClick={() => setViewerOpen(true)}
          className="relative overflow-hidden bg-ink active:opacity-95"
          style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
        >
          <video src={resolvedUri} muted className="h-full w-full object-cover opacity-80" />
          <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white">
            Play video
          </span>
        </button>
        {viewerOpen ? (
          <ConversationAttachmentViewer
            visible
            kind="video"
            signedUrl={resolvedUri}
            accessibilityLabel={label}
            onClose={() => setViewerOpen(false)}
          />
        ) : null}
      </>
    );
  }

  const openFile = () => {
    if (!signedUrl.data) return;
    window.open(signedUrl.data, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      type="button"
      onClick={openFile}
      disabled={!signedUrl.data}
      className={cn(
        'flex max-w-full items-center gap-2 px-4 py-3 text-left active:opacity-90 disabled:opacity-50',
        isOutgoing ? 'text-on-brand' : 'text-ink',
      )}
    >
      <span className="truncate text-sm font-medium">{attachment.fileName ?? 'File'}</span>
    </button>
  );
}

export function AttachmentMessageBubble({
  message,
  isOutgoing,
}: {
  message: RequestMessage;
  isOutgoing: boolean;
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
    <div className={cn('max-w-[85%]', isOutgoing ? 'self-end' : 'self-start')}>
      <div
        className={cn(
          'overflow-hidden rounded-2xl',
          isOutgoing ? 'rounded-br-md bg-active' : 'rounded-bl-md border border-hairline bg-elevated',
        )}
      >
        {attachments.length > 0 ? (
          <div className="flex flex-col gap-0.5 p-0.5">
            {useImageGallery ? (
              <ImageGalleryStack images={images} />
            ) : (
              images.map((attachment) => (
                <AttachmentTile key={attachment.id} attachment={attachment} isOutgoing={isOutgoing} />
              ))
            )}
            {rest.map((attachment) => (
              <AttachmentTile key={attachment.id} attachment={attachment} isOutgoing={isOutgoing} />
            ))}
          </div>
        ) : null}
        {hasBody ? (
          <p className={cn('px-4 py-2.5 text-base leading-6', isOutgoing ? 'text-on-brand' : 'text-ink')}>
            {body}
          </p>
        ) : null}
      </div>
    </div>
  );
}