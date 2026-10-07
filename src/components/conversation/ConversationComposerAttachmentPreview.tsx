import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import type { ComposerPendingAttachment } from '@/components/conversation/ConversationComposer';
import {
  type ConversationAttachmentUploadState,
  uploadPhaseLabel,
} from '@/features/requests/conversation-attachment-upload-state';
import { formatFileSizeBytes } from '@/lib/format';
import { useColors } from '@/theme';

const PREVIEW_WIDTH = 112;
const PREVIEW_HEIGHT = 80;

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function ConversationAttachmentUploadOverlay({
  upload,
  onRetry,
  onRemove,
  canRemove,
}: {
  upload?: ConversationAttachmentUploadState;
  onRetry?: () => void;
  onRemove?: () => void;
  canRemove: boolean;
}) {
  if (!upload || upload.phase === 'idle') return null;

  const label = uploadPhaseLabel(upload.phase);
  const showProgress =
    upload.phase === 'uploading' && upload.progress != null && Number.isFinite(upload.progress);
  const progressPercent = showProgress ? Math.round(upload.progress! * 100) : null;

  return (
    <View className="absolute inset-0 items-center justify-center bg-black/45 px-1">
      {upload.phase === 'failed' ? (
        <View className="items-center gap-1">
          <Ionicons name="alert-circle" size={22} color="#fff" />
          <Text className="text-center text-xs font-semibold text-white">{label}</Text>
          {upload.errorMessage ? (
            <Text className="text-center text-xs text-white/90" numberOfLines={2}>
              {upload.errorMessage}
            </Text>
          ) : null}
          <View className="mt-1 flex-row gap-2">
            {onRetry ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry upload"
                onPress={onRetry}
                className="rounded-full bg-white px-2.5 py-1"
              >
                <Text className="text-xs font-semibold text-ink">Retry</Text>
              </Pressable>
            ) : null}
            {canRemove && onRemove ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove attachment"
                onPress={onRemove}
                className="rounded-full border border-white px-2.5 py-1"
              >
                <Text className="text-xs font-semibold text-white">Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : upload.phase === 'uploaded' ? (
        <Ionicons name="checkmark-circle" size={28} color="#fff" />
      ) : upload.phase === 'cancelled' ? (
        <Text className="text-center text-xs font-medium text-white">{label}</Text>
      ) : (
        <View className="w-full items-center gap-1 px-2">
          <ActivityIndicator color="#fff" />
          {label ? <Text className="text-xs font-medium text-white">{label}</Text> : null}
          {progressPercent != null ? (
            <View className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/30">
              <View
                className="h-full rounded-full bg-white"
                style={{ width: `${progressPercent}%` }}
              />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

function PendingAttachmentTile({
  item,
  upload,
  onRemove,
  onRetry,
  uploadLocked,
}: {
  item: ComposerPendingAttachment;
  upload?: ConversationAttachmentUploadState;
  onRemove: () => void;
  onRetry?: () => void;
  uploadLocked: boolean;
}) {
  const colors = useColors();
  const { prepared, attachment, kindHint, source } = item;
  const displayName = prepared.fileName || attachment.name || 'File';
  const sizeLabel = formatFileSizeBytes(prepared.fileSize);
  const failed = upload?.phase === 'failed';
  const busy =
    upload?.phase === 'preparing' || upload?.phase === 'uploading' || upload?.phase === 'retrying';
  const canRemove = !uploadLocked || failed || upload?.phase === 'cancelled';

  return (
    <View className="relative mr-2 w-28">
      <View
        className={`overflow-hidden rounded-xl border bg-elevated ${
          failed ? 'border-red-500' : 'border-hairline'
        }`}
      >
        {kindHint === 'file' ? (
          <View className="h-20 items-center justify-center gap-1 px-2">
            <Ionicons name="document-outline" size={28} color={colors.active} />
            <Text className="w-full text-center text-xs font-medium text-ink" numberOfLines={2}>
              {displayName}
            </Text>
            {sizeLabel ? <Text className="text-xs text-muted">{sizeLabel}</Text> : null}
          </View>
        ) : (
          <View style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}>
            <Image
              source={{ uri: prepared.localUri }}
              style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
              contentFit="cover"
              accessibilityLabel={
                source === 'video' ? 'Video attachment preview' : 'Photo attachment preview'
              }
            />
            {source === 'video' && !busy && !failed ? (
              <View className="absolute bottom-1 left-1 flex-row items-center gap-0.5 rounded bg-black/55 px-1.5 py-0.5">
                <Ionicons name="videocam" size={12} color="#fff" />
                {attachment.durationMs != null ? (
                  <Text className="text-xs font-medium text-white">
                    {formatDuration(attachment.durationMs)}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
        <ConversationAttachmentUploadOverlay
          upload={upload}
          onRetry={failed ? onRetry : undefined}
          onRemove={failed ? onRemove : undefined}
          canRemove={canRemove}
        />
      </View>
      {canRemove && !failed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove attachment"
          onPress={onRemove}
          disabled={busy}
          className="absolute -right-1 -top-1 h-6 w-6 items-center justify-center rounded-full border border-hairline bg-elevated"
          style={{ opacity: busy ? 0.35 : 1 }}
        >
          <Ionicons name="close" size={14} color={colors.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function ConversationComposerAttachmentPreview({
  items,
  uploadStateById,
  uploadActive,
  onRemove,
  onRetry,
  onCancelUpload,
}: {
  items: ComposerPendingAttachment[];
  uploadStateById?: Record<string, ConversationAttachmentUploadState>;
  uploadActive?: boolean;
  onRemove: (id: string) => void;
  onRetry?: () => void;
  onCancelUpload?: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <View className="border-t border-hairline bg-canvas px-4 pt-3">
      {uploadActive ? (
        <View className="mb-2 flex-row items-center justify-between gap-2">
          <Text className="text-sm text-muted">Sending attachments…</Text>
          {onCancelUpload ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel upload"
              onPress={onCancelUpload}
              hitSlop={8}
            >
              <Text className="text-sm font-semibold text-active">Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pr-2"
      >
        {items.map((item) => (
          <PendingAttachmentTile
            key={item.id}
            item={item}
            upload={uploadStateById?.[item.id]}
            uploadLocked={Boolean(uploadActive)}
            onRemove={() => onRemove(item.id)}
            onRetry={onRetry}
          />
        ))}
      </ScrollView>
    </View>
  );
}
