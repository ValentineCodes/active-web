'use client';

import type { ComposerPendingAttachment } from '@/components/conversation/ConversationComposer';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import {
  type ConversationAttachmentUploadState,
  uploadPhaseLabel,
} from '@/features/requests/conversation-attachment-upload-state';
import { formatFileSizeBytes } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme/ThemeProvider';

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
    <div className="absolute inset-0 flex items-center justify-center bg-black/45 px-1">
      {upload.phase === 'failed' ? (
        <div className="flex flex-col items-center gap-1">
          <IonIcon icon={ionIcons['alert-circle']} size={22} color="#ffffff" />
          {label ? <span className="text-center text-xs font-semibold text-white">{label}</span> : null}
          {upload.errorMessage ? (
            <span className="line-clamp-2 text-center text-xs text-white/90">{upload.errorMessage}</span>
          ) : null}
          <div className="mt-1 flex flex-row gap-2">
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink"
              >
                Retry
              </button>
            ) : null}
            {canRemove && onRemove ? (
              <button
                type="button"
                onClick={onRemove}
                className="rounded-full border border-white px-2.5 py-1 text-xs font-semibold text-white"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      ) : upload.phase === 'uploaded' ? (
        <IonIcon icon={ionIcons['checkmark-circle']} size={28} color="#ffffff" />
      ) : upload.phase === 'cancelled' ? (
        <span className="text-center text-xs font-medium text-white">{label}</span>
      ) : (
        <div className="flex w-full flex-col items-center gap-1 px-2">
          <span
            className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white"
            aria-hidden
          />
          {label ? <span className="text-xs font-medium text-white">{label}</span> : null}
          {progressPercent != null ? (
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/30">
              <div className="h-full rounded-full bg-white" style={{ width: `${progressPercent}%` }} />
            </div>
          ) : null}
        </div>
      )}
    </div>
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
    <div className="relative mr-2 w-28 shrink-0">
      <div
        className={cn(
          'overflow-hidden rounded-xl border bg-elevated',
          failed ? 'border-red-500' : 'border-hairline',
        )}
      >
        {kindHint === 'file' ? (
          <div className="flex h-20 flex-col items-center justify-center gap-1 px-2">
            <IonIcon icon={ionIcons['document-outline']} size={28} color={colors.active} />
            <span className="w-full truncate text-center text-xs font-medium text-ink">{displayName}</span>
            {sizeLabel ? <span className="text-xs text-muted">{sizeLabel}</span> : null}
          </div>
        ) : (
          <div className="relative" style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}>
            <img
              src={prepared.localUri}
              alt={source === 'video' ? 'Video attachment preview' : 'Photo attachment preview'}
              className="h-full w-full object-cover"
              width={PREVIEW_WIDTH}
              height={PREVIEW_HEIGHT}
            />
            {source === 'video' && !busy && !failed ? (
              <span className="absolute bottom-1 left-1 flex flex-row items-center gap-0.5 rounded bg-black/55 px-1.5 py-0.5">
                <IonIcon icon={ionIcons.videocam} size={12} color="#ffffff" />
                {attachment.durationMs != null ? (
                  <span className="text-xs font-medium text-white">{formatDuration(attachment.durationMs)}</span>
                ) : null}
              </span>
            ) : null}
          </div>
        )}
        <ConversationAttachmentUploadOverlay
          upload={upload}
          onRetry={failed ? onRetry : undefined}
          onRemove={failed ? onRemove : undefined}
          canRemove={canRemove}
        />
      </div>
      {canRemove && !failed ? (
        <button
          type="button"
          aria-label="Remove attachment"
          onClick={onRemove}
          disabled={busy}
          className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-hairline bg-elevated disabled:opacity-35"
        >
          <IonIcon icon={ionIcons.close} size={14} color={colors.ink} />
        </button>
      ) : null}
    </div>
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
    <div className="border-t border-hairline bg-canvas px-4 pt-3">
      {uploadActive ? (
        <div className="mb-2 flex flex-row items-center justify-between gap-2">
          <span className="text-sm text-muted">Sending attachments…</span>
          {onCancelUpload ? (
            <button type="button" onClick={onCancelUpload} className="text-sm font-semibold text-active">
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-row gap-0 overflow-x-auto pb-1 pr-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
      </div>
    </div>
  );
}