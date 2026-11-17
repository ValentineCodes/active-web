'use client';

import { useCallback, useRef, useState } from 'react';

import {
  ConversationAttachmentSheet,
  type ConversationAttachmentSheetOption,
} from '@/components/conversation/ConversationAttachmentSheet';
import { ConversationComposerAttachmentPreview } from '@/components/conversation/ConversationComposerAttachmentPreview';
import { IconButton } from '@/components/ui/IconButton';
import { CONVERSATION_ATTACHMENTS } from '@/config/index';
import { prepareConversationAttachment } from '@/features/requests/conversation-attachment-upload';
import type { PreparedConversationAttachment } from '@/features/requests/conversation-attachment-upload';
import type { ConversationAttachmentUploadState } from '@/features/requests/conversation-attachment-upload-state';
import { mapConversationAttachmentError } from '@/features/requests/conversation-attachment-policy';
import { isChatSendBlockedByProfilePhoto } from '@/features/requests/chat-send-eligibility';
import {
  chooseConversationFile,
  pickConversationPhotosFromLibrary,
  recordConversationVideo,
  takeConversationPhoto,
  type ConversationAttachmentKind,
  type ConversationPickedAttachment,
} from '@/features/requests/conversation-media';
import { cn } from '@/lib/cn';
import { showAppToast } from '@/lib/toast';

const MAX_LENGTH = 2000;

export type ComposerPendingAttachment = {
  id: string;
  attachment: ConversationPickedAttachment;
  kindHint: ConversationAttachmentKind;
  source: 'photo' | 'photos' | 'video' | 'file';
  prepared: PreparedConversationAttachment;
};

export function ConversationComposer({
  onSend,
  sending,
  disabled = false,
  disabledHint,
  uploadStateById,
  uploadActive = false,
  onCancelUpload,
  onClearUploadState,
}: {
  onSend: (body: string, pendingAttachments: ComposerPendingAttachment[]) => void | Promise<void>;
  sending: boolean;
  disabled?: boolean;
  disabledHint?: string;
  uploadStateById?: Record<string, ConversationAttachmentUploadState>;
  uploadActive?: boolean;
  onCancelUpload?: () => void;
  onClearUploadState?: (attachmentId: string) => void;
}) {
  const [text, setText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ComposerPendingAttachment[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const submitLockRef = useRef(false);

  const trimmed = text.trim();
  const hasAttachments = pendingAttachments.length > 0;
  const canSend = (trimmed.length > 0 || hasAttachments) && !sending && !disabled && !uploadActive;
  const canAttach = !disabled && !uploadActive && pendingAttachments.length < CONVERSATION_ATTACHMENTS.maxPerMessage;

  const removePending = useCallback(
    (id: string) => {
      setPendingAttachments((current) => current.filter((item) => item.id !== id));
      onClearUploadState?.(id);
    },
    [onClearUploadState],
  );

  const submit = useCallback(async () => {
    if (!canSend || submitLockRef.current) return;

    submitLockRef.current = true;
    const snapshot = { text: trimmed, pending: pendingAttachments };
    setText('');
    setPendingAttachments([]);

    try {
      await onSend(snapshot.text, snapshot.pending);
    } catch (error) {
      setText(snapshot.text);
      if (isChatSendBlockedByProfilePhoto(error)) {
        setPendingAttachments(snapshot.pending);
        return;
      }
      if (snapshot.pending.length === 0) {
        setPendingAttachments(snapshot.pending);
      }
    } finally {
      submitLockRef.current = false;
    }
  }, [canSend, onSend, pendingAttachments, trimmed]);

  const runAttachmentPick = useCallback(
    async (option: ConversationAttachmentSheetOption) => {
      if (uploadActive) return;

      const slotsLeft = CONVERSATION_ATTACHMENTS.maxPerMessage - pendingAttachments.length;
      if (slotsLeft < 1) {
        showAppToast(`You can attach up to ${CONVERSATION_ATTACHMENTS.maxPerMessage} files.`, {
          type: 'warning',
        });
        return;
      }

      const stageAttachment = async (
        attachment: ConversationPickedAttachment,
        kindHint: ConversationAttachmentKind,
        source: ComposerPendingAttachment['source'],
      ) => {
        const prepared = await prepareConversationAttachment(attachment, kindHint);
        const stagedAttachment: ConversationPickedAttachment = {
          ...attachment,
          uri: prepared.localUri,
          mimeType: prepared.mimeType,
          fileSize: prepared.fileSize,
          name: prepared.fileName,
        };

        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          attachment: stagedAttachment,
          kindHint,
          source,
          prepared,
        };
      };

      try {
        if (option === 'photos') {
          const picks = await pickConversationPhotosFromLibrary(slotsLeft);
          if (picks.length === 0) return;

          const staged: ComposerPendingAttachment[] = [];
          for (const attachment of picks) {
            if (staged.length >= slotsLeft) break;
            staged.push(await stageAttachment(attachment, 'image', 'photos'));
          }

          setPendingAttachments((current) => [...current, ...staged]);
          return;
        }

        const attachment =
          option === 'photo'
            ? await takeConversationPhoto()
            : option === 'video'
              ? await recordConversationVideo()
              : await chooseConversationFile();
        if (!attachment) return;

        const kindHint: ConversationAttachmentKind =
          option === 'photo' ? 'image' : option === 'video' ? 'video' : 'file';
        const source: ComposerPendingAttachment['source'] = option === 'browse' ? 'file' : option;

        const stagedItem = await stageAttachment(attachment, kindHint, source);
        setPendingAttachments((current) => [...current, stagedItem]);
      } catch (error) {
        showAppToast(mapConversationAttachmentError(error), { type: 'warning' });
      }
    },
    [pendingAttachments.length, uploadActive],
  );

  return (
    <>
      <ConversationComposerAttachmentPreview
        items={pendingAttachments}
        uploadStateById={uploadStateById}
        uploadActive={uploadActive}
        onRemove={removePending}
        onRetry={() => void submit()}
        onCancelUpload={onCancelUpload}
      />
      <div className="flex flex-row items-end gap-1 border-t border-hairline bg-canvas px-4 py-3">
        <textarea
          aria-label="Message"
          placeholder={disabled ? (disabledHint ?? 'Read-only') : 'Message'}
          maxLength={MAX_LENGTH}
          disabled={disabled || sending || uploadActive}
          value={text}
          rows={1}
          onChange={(event) => setText(event.target.value)}
          className={cn(
            'max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-hairline bg-elevated px-4 py-2.5 text-base text-ink outline-none placeholder:text-subtle',
            (disabled || sending || uploadActive) && 'opacity-60',
          )}
        />
        <div className={cn(canAttach ? '' : 'opacity-35')}>
          <IconButton
            icon="add"
            accessibilityLabel="Add photo, video, or file"
            variant="surface"
            onClick={() => {
              if (!canAttach) return;
              setAttachOpen(true);
            }}
          />
        </div>
        <div className={cn(canSend ? '' : 'opacity-35')}>
          <IconButton icon="send" accessibilityLabel="Send message" variant="brand" onClick={() => void submit()} />
        </div>
      </div>

      <ConversationAttachmentSheet
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        onSelect={(option) => {
          setAttachOpen(false);
          void runAttachmentPick(option);
        }}
      />
    </>
  );
}