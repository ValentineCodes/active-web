import { useCallback, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { ConversationComposerAttachmentPreview } from '@/components/conversation/ConversationComposerAttachmentPreview';
import {
  ConversationAttachmentSheet,
  type ConversationAttachmentSheetHandle,
  type ConversationAttachmentSheetOption,
} from '@/components/conversation/ConversationAttachmentSheet';
import { IconButton } from '@/components/ui/IconButton';
import { CONVERSATION_ATTACHMENTS } from '@/config';
import { prepareConversationAttachment } from '@/features/requests/conversation-attachment-upload';
import type { PreparedConversationAttachment } from '@/features/requests/conversation-attachment-upload';
import type { RequestMessage } from '@/features/requests/conversation-message-model';
import type { ConversationAttachmentUploadState } from '@/features/requests/conversation-attachment-upload-state';
import { mapConversationAttachmentError } from '@/features/requests/conversation-attachment-policy';
import {
  chooseConversationFile,
  pickConversationPhotosFromLibrary,
  recordConversationVideo,
  takeConversationPhoto,
  type ConversationAttachmentKind,
  type ConversationPickedAttachment,
} from '@/features/requests/conversation-media';
import { showAppToast } from '@/lib/toast';
import { poppinsInputTypography } from '@/theme/fonts';
import { useColors } from '@/theme';

const MAX_LENGTH = 2000;

export function composerPendingFromOutgoingMessage(
  message: RequestMessage,
): ComposerPendingAttachment[] {
  return message.attachments.map((attachment) => {
    const localUri = attachment.localPreviewUri;
    if (!localUri) {
      throw new Error('Could not retry this attachment.');
    }

    const kindHint = attachment.attachmentType;
    const source = kindHint === 'file' ? 'file' : kindHint === 'video' ? 'video' : 'photo';

    return {
      id: attachment.id,
      attachment: {
        uri: localUri,
        mimeType: attachment.mimeType,
        name: attachment.fileName ?? 'attachment',
        fileSize: attachment.fileSize ?? 0,
      },
      kindHint,
      source,
      prepared: {
        fileName: attachment.fileName ?? 'attachment',
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize ?? 0,
        attachmentType: attachment.attachmentType,
        localUri,
      },
    };
  });
}

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
  const colors = useColors();
  const [text, setText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ComposerPendingAttachment[]>([]);
  const attachmentSheetRef = useRef<ConversationAttachmentSheetHandle>(null);
  const submitLockRef = useRef(false);
  const fieldTypography = poppinsInputTypography('regular', 'base', { multiline: true });

  const trimmed = text.trim();
  const hasAttachments = pendingAttachments.length > 0;
  const canSend = (trimmed.length > 0 || hasAttachments) && !sending && !disabled;
  const canAttach = !disabled && pendingAttachments.length < CONVERSATION_ATTACHMENTS.maxPerMessage;

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
    } catch {
      setText(snapshot.text);
      // Attachment sends show in the thread; keep composer staging cleared.
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
        showAppToast(
          `You can attach up to ${CONVERSATION_ATTACHMENTS.maxPerMessage} files.`,
          'warning',
        );
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
        showAppToast(mapConversationAttachmentError(error), 'warning');
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
      <View className="flex-row items-end gap-1 border-t border-hairline bg-canvas px-4 py-3">
        <TextInput
          accessibilityLabel="Message"
          placeholder={disabled ? (disabledHint ?? 'Read-only') : 'Message'}
          placeholderTextColor={colors.subtle}
          multiline
          maxLength={MAX_LENGTH}
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => void submit()}
          blurOnSubmit={false}
          editable={!disabled && !sending}
          className="max-h-32 min-h-11 flex-1 rounded-2xl border border-hairline bg-elevated px-4 py-2.5 text-ink"
          style={[fieldTypography, disabled || sending ? { opacity: 0.6 } : undefined]}
        />
        <View style={{ opacity: canAttach ? 1 : 0.35 }}>
          <IconButton
            icon="add"
            accessibilityLabel="Add photo, video, or file"
            variant="surface"
            onPress={() => {
              if (!canAttach) return;
              attachmentSheetRef.current?.present();
            }}
          />
        </View>
        <View style={{ opacity: canSend ? 1 : 0.35 }}>
          <IconButton
            icon="send"
            accessibilityLabel="Send message"
            onPress={() => {
              if (canSend) void submit();
            }}
            variant="brand"
          />
        </View>
      </View>

      <ConversationAttachmentSheet
        ref={attachmentSheetRef}
        onSelect={(option) => void runAttachmentPick(option)}
      />
    </>
  );
}
