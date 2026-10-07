import { memo, useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { ConversationAttachmentUploadOverlay } from '@/components/conversation/ConversationComposerAttachmentPreview';
import {
  ConversationAttachmentViewer,
  ConversationImageGalleryViewer,
} from '@/components/conversation/ConversationAttachmentViewer';
import type {
  RequestMessage,
  RequestMessageAttachment,
} from '@/features/requests/conversation-message-model';
import type { ConversationAttachmentUploadState } from '@/features/requests/conversation-attachment-upload-state';
import { useConversationAttachmentUrl } from '@/features/requests/conversation-attachment-url';
import { formatChatMessageTime, formatFileSizeBytes } from '@/lib/format';
import { cn } from '@/lib/cn';
import { showAppToast } from '@/lib/toast';
import { useColors } from '@/theme';

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

const ImageGalleryStack = memo(function ImageGalleryStack({
  images,
  upload,
  onRetry,
  onDelete,
}: {
  images: RequestMessageAttachment[];
  upload?: ConversationAttachmentUploadState;
  onRetry?: () => void;
  onDelete?: () => void;
}) {
  const colors = useColors();
  const [viewerOpen, setViewerOpen] = useState(false);
  const lead = images[0];
  const hasStorage = Boolean(lead && lead.storagePath.length > 0);
  const localPreviewUri = lead?.localPreviewUri;
  const signedUrl = useConversationAttachmentUrl(hasStorage && lead ? lead.storagePath : null);
  const showUploadOverlay = Boolean(
    upload && upload.phase !== 'idle' && upload.phase !== 'uploaded',
  );

  const resolvedThumbUri =
    signedUrl.data ??
    (localPreviewUri && (signedUrl.isPending || signedUrl.isError) ? localPreviewUri : null);

  const openGallery = useCallback(() => {
    if (!resolvedThumbUri && signedUrl.isPending) return;
    if (!resolvedThumbUri) return;
    setViewerOpen(true);
  }, [resolvedThumbUri, signedUrl.isPending]);

  const closeGallery = useCallback(() => setViewerOpen(false), []);

  if (!lead) {
    return null;
  }

  if (!hasStorage && !localPreviewUri) {
    return (
      <View
        className="items-center justify-center bg-surface"
        style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
      >
        <ActivityIndicator color={colors.subtle} />
      </View>
    );
  }

  if (!resolvedThumbUri) {
    if (signedUrl.isPending) {
      return (
        <View
          className="items-center justify-center bg-surface"
          style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
        >
          <ActivityIndicator color={colors.subtle} />
        </View>
      );
    }
    return (
      <View
        className="items-center justify-center bg-surface px-3"
        style={{ width: THUMB_WIDTH, minHeight: 72 }}
      >
        <Text className="text-center text-sm text-muted">Could not load this attachment.</Text>
      </View>
    );
  }

  const countLabel = String(images.length);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${countLabel} photos`}
        onPress={openGallery}
        className="relative overflow-hidden bg-surface"
        style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
      >
        <Image
          source={{ uri: resolvedThumbUri }}
          recyclingKey={lead.id}
          cachePolicy="memory-disk"
          style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
          contentFit="cover"
        />
        {images.length > 1 ? (
          <View className="absolute bottom-2 right-2 min-h-6 min-w-6 items-center justify-center rounded-md bg-black/60 px-1.5">
            <Text className="text-lg font-semibold leading-5 text-white">{countLabel}</Text>
          </View>
        ) : null}
        {showUploadOverlay ? (
          <ConversationAttachmentUploadOverlay
            upload={upload}
            onRetry={upload?.phase === 'failed' ? onRetry : undefined}
            onRemove={upload?.phase === 'failed' ? onDelete : undefined}
            canRemove={upload?.phase === 'failed'}
          />
        ) : null}
      </Pressable>
      {viewerOpen ? (
        <ConversationImageGalleryViewer
          attachments={images}
          initialIndex={0}
          onClose={closeGallery}
        />
      ) : null}
    </>
  );
});

function attachmentAccessibilityLabel(attachment: RequestMessageAttachment): string {
  if (attachment.fileName) return attachment.fileName;
  if (attachment.attachmentType === 'image') return 'Image attachment';
  if (attachment.attachmentType === 'video') return 'Video attachment';
  return 'File attachment';
}

const AttachmentTile = memo(function AttachmentTile({
  attachment,
  isOutgoing,
  upload,
  onRetry,
  onDelete,
}: {
  attachment: RequestMessageAttachment;
  isOutgoing: boolean;
  upload?: ConversationAttachmentUploadState;
  onRetry?: () => void;
  onDelete?: () => void;
}) {
  const colors = useColors();
  const hasStorage = attachment.storagePath.length > 0;
  const localPreviewUri = attachment.localPreviewUri;
  const signedUrl = useConversationAttachmentUrl(hasStorage ? attachment.storagePath : null);
  const label = attachmentAccessibilityLabel(attachment);
  const [viewerOpen, setViewerOpen] = useState(false);
  const showUploadOverlay = Boolean(
    upload && upload.phase !== 'idle' && upload.phase !== 'uploaded',
  );

  const openViewer = useCallback(() => {
    if (!signedUrl.data && !localPreviewUri) return;
    setViewerOpen(true);
  }, [localPreviewUri, signedUrl.data]);

  const openFile = useCallback(async () => {
    if (!signedUrl.data) return;
    try {
      await Linking.openURL(signedUrl.data);
    } catch {
      showAppToast('Could not open this file.', 'warning');
    }
  }, [signedUrl.data]);

  const closeViewer = useCallback(() => setViewerOpen(false), []);

  const resolvedThumbUri =
    signedUrl.data ??
    (localPreviewUri && (signedUrl.isPending || signedUrl.isError) ? localPreviewUri : null);

  if (!hasStorage && localPreviewUri) {
    if (attachment.attachmentType === 'file') {
      const sizeLabel = formatFileSizeBytes(attachment.fileSize);
      return (
        <View className="relative">
          <View
            className="flex-row items-center gap-3 px-4 py-3"
            style={{ maxWidth: THUMB_WIDTH + 32 }}
          >
            <Ionicons
              name="document-outline"
              size={24}
              color={isOutgoing ? colors.onBrand : colors.active}
            />
            <View className="min-w-0 flex-1">
              <Text
                className={cn('text-base font-semibold', isOutgoing ? 'text-on-brand' : 'text-ink')}
                numberOfLines={2}
              >
                {attachment.fileName ?? 'File'}
              </Text>
              {sizeLabel ? (
                <Text className={cn('text-xs', isOutgoing ? 'text-on-brand/80' : 'text-muted')}>
                  {sizeLabel}
                </Text>
              ) : null}
            </View>
          </View>
          {showUploadOverlay ? (
            <ConversationAttachmentUploadOverlay
              upload={upload}
              onRetry={upload?.phase === 'failed' ? onRetry : undefined}
              onRemove={upload?.phase === 'failed' ? onDelete : undefined}
              canRemove={upload?.phase === 'failed'}
            />
          ) : null}
        </View>
      );
    }

    return (
      <View
        className="relative overflow-hidden bg-surface"
        style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
      >
        <Image
          source={{ uri: localPreviewUri }}
          recyclingKey={attachment.id}
          cachePolicy="memory-disk"
          style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
          contentFit="cover"
        />
        {attachment.attachmentType === 'video' && !showUploadOverlay ? (
          <View className="absolute inset-0 items-center justify-center bg-black/25">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-black/50">
              <Ionicons name="play" size={26} color="#fff" style={{ marginLeft: 3 }} />
            </View>
          </View>
        ) : null}
        {showUploadOverlay ? (
          <ConversationAttachmentUploadOverlay
            upload={upload}
            onRetry={upload?.phase === 'failed' ? onRetry : undefined}
            onRemove={upload?.phase === 'failed' ? onDelete : undefined}
            canRemove={upload?.phase === 'failed'}
          />
        ) : null}
      </View>
    );
  }

  if (!hasStorage) {
    return (
      <View
        className="items-center justify-center bg-surface"
        style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
      >
        <ActivityIndicator color={colors.subtle} />
      </View>
    );
  }

  if (signedUrl.isPending && !resolvedThumbUri) {
    return (
      <View
        className="items-center justify-center bg-surface"
        style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
      >
        <ActivityIndicator color={colors.subtle} />
      </View>
    );
  }

  if (!resolvedThumbUri) {
    return (
      <View
        className="items-center justify-center bg-surface px-3"
        style={{ width: THUMB_WIDTH, minHeight: 72 }}
      >
        <Text className="text-center text-sm text-muted">Could not load this attachment.</Text>
      </View>
    );
  }

  const uri = resolvedThumbUri;
  const viewerUri = signedUrl.data ?? resolvedThumbUri;

  if (attachment.attachmentType === 'image') {
    return (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${label}`}
          onPress={openViewer}
          className="overflow-hidden bg-surface"
          style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
        >
          <Image
            source={{ uri }}
            recyclingKey={attachment.id}
            cachePolicy="memory-disk"
            style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
            contentFit="cover"
          />
        </Pressable>
        <ConversationAttachmentViewer
          visible={viewerOpen}
          kind="image"
          signedUrl={viewerUri}
          accessibilityLabel={label}
          onClose={closeViewer}
        />
      </>
    );
  }

  if (attachment.attachmentType === 'video') {
    return (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Play ${label}`}
          onPress={openViewer}
          className="overflow-hidden bg-surface"
          style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
        >
          <Image
            source={{ uri }}
            recyclingKey={attachment.id}
            cachePolicy="memory-disk"
            style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
            contentFit="cover"
          />
          <View className="absolute inset-0 items-center justify-center bg-black/25">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-black/50">
              <Ionicons name="play" size={26} color="#fff" style={{ marginLeft: 3 }} />
            </View>
          </View>
        </Pressable>
        <ConversationAttachmentViewer
          visible={viewerOpen}
          kind="video"
          signedUrl={viewerUri}
          accessibilityLabel={label}
          onClose={closeViewer}
        />
      </>
    );
  }

  const sizeLabel = formatFileSizeBytes(attachment.fileSize);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${label}`}
      onPress={() => void openFile()}
      className="flex-row items-center gap-3 px-4 py-3"
      style={{ maxWidth: THUMB_WIDTH + 32 }}
    >
      <Ionicons
        name="document-outline"
        size={24}
        color={isOutgoing ? colors.onBrand : colors.active}
      />
      <View className="min-w-0 flex-1">
        <Text
          className={cn('text-base font-semibold', isOutgoing ? 'text-on-brand' : 'text-ink')}
          numberOfLines={2}
        >
          {attachment.fileName ?? 'File'}
        </Text>
        {sizeLabel ? (
          <Text className={cn('text-xs', isOutgoing ? 'text-on-brand/80' : 'text-muted')}>
            {sizeLabel}
          </Text>
        ) : null}
      </View>
      <Ionicons name="open-outline" size={20} color={isOutgoing ? colors.onBrand : colors.subtle} />
    </Pressable>
  );
});

export function AttachmentMessageBubble({
  message,
  isOutgoing,
  uploadStateByAttachmentId,
  onRetry,
  onDelete,
}: {
  message: RequestMessage;
  isOutgoing: boolean;
  uploadStateByAttachmentId?: Record<string, ConversationAttachmentUploadState>;
  onRetry?: () => void;
  onDelete?: () => void;
}) {
  const attachments = message.attachments;
  const { images, rest } = partitionMessageAttachments(attachments);
  const useImageGallery = images.length > 1;
  const body = message.body.trim();
  const hasBody = body.length > 0;

  return (
    <View
      className={cn(
        'max-w-[85%] gap-1',
        isOutgoing ? 'items-end self-end' : 'items-start self-start',
      )}
    >
      <View
        className={cn(
          'overflow-hidden rounded-2xl',
          isOutgoing
            ? 'rounded-br-md bg-active'
            : 'rounded-bl-md border border-hairline bg-elevated',
        )}
      >
        <View className="gap-0.5">
          {useImageGallery ? (
            <ImageGalleryStack
              images={images}
              upload={galleryUploadState(images, uploadStateByAttachmentId)}
              onRetry={onRetry}
              onDelete={onDelete}
            />
          ) : (
            images.map((attachment) => (
              <AttachmentTile
                key={attachment.id}
                attachment={attachment}
                isOutgoing={isOutgoing}
                upload={uploadStateByAttachmentId?.[attachment.id]}
                onRetry={onRetry}
                onDelete={onDelete}
              />
            ))
          )}
          {rest.map((attachment) => (
            <AttachmentTile
              key={attachment.id}
              attachment={attachment}
              isOutgoing={isOutgoing}
              upload={uploadStateByAttachmentId?.[attachment.id]}
              onRetry={onRetry}
              onDelete={onDelete}
            />
          ))}
        </View>
        {hasBody ? (
          <View className="px-4 py-2.5">
            <Text
              selectable
              className={cn('text-base leading-6', isOutgoing ? 'text-on-brand' : 'text-ink')}
            >
              {body}
            </Text>
          </View>
        ) : null}
      </View>
      <Text className="px-1 text-xs text-muted">{formatChatMessageTime(message.createdAt)}</Text>
    </View>
  );
}
