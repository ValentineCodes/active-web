import { useCallback, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { ConversationComposerAttachmentPreview } from '@/components/conversation/ConversationComposerAttachmentPreview';
import {
  ConversationAttachmentSheet,
  type ConversationAttachmentSheetHandle,
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
  source: 'photo' | 'video' | 'file';
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
    async (kind: 'photo' | 'video' | 'file') => {
      if (uploadActive) return;
      if (pendingAttachments.length >= CONVERSATION_ATTACHMENTS.maxPerMessage) {
        showAppToast(
          `You can attach up to ${CONVERSATION_ATTACHMENTS.maxPerMessage} files.`,
          'warning',
        );
        return;
      }

      try {
        const attachment =
          kind === 'photo'
            ? await takeConversationPhoto()
            : kind === 'video'
              ? await recordConversationVideo()
              : await chooseConversationFile();
        if (!attachment) return;

        const kindHint: ConversationAttachmentKind =
          kind === 'photo' ? 'image' : kind === 'video' ? 'video' : 'file';
        const prepared = await prepareConversationAttachment(attachment, kindHint);
        const stagedAttachment: ConversationPickedAttachment = {
          ...attachment,
          uri: prepared.localUri,
          mimeType: prepared.mimeType,
          fileSize: prepared.fileSize,
          name: prepared.fileName,
        };

        setPendingAttachments((current) => [
          ...current,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            attachment: stagedAttachment,
            kindHint,
            source: kind,
            prepared,
          },
        ]);
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
