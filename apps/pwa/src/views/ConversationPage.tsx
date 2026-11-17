'use client';

import { leaveMessageThread, parseConversationReturnTo } from '@/lib/conversation-navigation';
import { useRouter, useSearchParams } from '@/lib/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { LiveProfilePhotoCapture } from '@/components/profile/LiveProfilePhotoCapture';
import { ProfilePhotoCaptureContent } from '@/components/profile/ProfilePhotoCaptureContent';
import {
  ConversationComposer,
  type ComposerPendingAttachment,
} from '@/components/conversation/ConversationComposer';
import { ConversationDateSeparator } from '@/components/conversation/ConversationDateSeparator';
import { ConversationHeader } from '@/components/conversation/ConversationHeader';
import { AttachmentMessageBubble } from '@/components/conversation/AttachmentMessageBubble';
import { MessageBubble } from '@/components/conversation/MessageBubble';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { InlineError, LoadingState } from '@/components/ui/StateView';
import { useRouteParam } from '@/lib/route-param';
import { useUserId } from '@/features/auth/use-user-id';
import { useChatSendGate } from '@/features/profile/use-chat-send-gate';
import { shouldShowChatDaySeparatorChronological } from '@/features/requests/chat-day-separators';
import {
  createPendingMessageId,
  useLiveConversationMessages,
  useResolvedRequestConversation,
  useRequestMessages,
  useSendRequestMessage,
  useSendRequestMessageAttachment,
} from '@/features/requests/conversation-api';
import {
  initialUploadStates,
  isConversationUploadCancelledError,
  type ConversationAttachmentUploadState,
} from '@/features/requests/conversation-attachment-upload-state';
import {
  assertConversationMessageSendable,
  createConversationClientSendId,
} from '@/features/requests/conversation-message-send';
import { formatAgo } from '@/lib/format';
import { showAppToast } from '@/lib/toast';

export function ConversationPage() {
  const router = useRouter();
  const search = useSearchParams();
  const id = useRouteParam('id');
  const returnTo = parseConversationReturnTo(search.get('returnTo'));

  const goBack = () => leaveMessageThread(router, returnTo);
  const userId = useUserId();
  const conversation = useResolvedRequestConversation(id);
  const conversationId = conversation.data?.conversationId;
  const requestId = conversation.data?.requestId ?? '';
  const messages = useRequestMessages(conversationId);
  const sendText = useSendRequestMessage(conversationId ?? '', requestId);
  const sendAttachment = useSendRequestMessageAttachment(conversationId ?? '', requestId);
  const {
    profile,
    gateChatSend,
    photoReady,
    captureButtonLabel,
    capturePhoto,
    resumePendingSend,
    isChatSendBlockedByProfilePhoto,
  } = useChatSendGate();
  const [focused, setFocused] = useState(true);
  const [captureOpen, setCaptureOpen] = useState(false);

  const sendLockRef = useRef(false);
  const cancelUploadRef = useRef(false);
  const clientSendIdRef = useRef<string | null>(null);
  const [outgoingUploadByMessageId, setOutgoingUploadByMessageId] = useState<
    Record<string, Record<string, ConversationAttachmentUploadState>>
  >({});

  const openCapture = () => setCaptureOpen(true);

  const clearOutgoingUploadState = useCallback((messageId: string) => {
    setOutgoingUploadByMessageId((current) => {
      if (!current[messageId]) return current;
      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }, []);

  const setOutgoingAttachmentState = useCallback(
    (messageId: string, attachmentId: string, state: ConversationAttachmentUploadState) => {
      setOutgoingUploadByMessageId((current) => ({
        ...current,
        [messageId]: {
          ...current[messageId],
          [attachmentId]: state,
        },
      }));
    },
    [],
  );

  useLiveConversationMessages(
    conversationId,
    requestId,
    focused && Boolean(conversationId),
    conversation.data?.counterpartyDisplayName,
  );

  useEffect(() => {
    const onVis = () => setFocused(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToLatest = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const rows = messages.messagesChronological ?? [];

  const sendOutgoingAttachments = useCallback(
    async (pendingId: string, body: string, pending: ComposerPendingAttachment[], isRetry: boolean) => {
      if (!conversationId || !userId) return;

      const attachmentIds = pending.map((item) => item.id);
      const optimisticBody = body.trim();

      setOutgoingUploadByMessageId((current) => ({
        ...current,
        [pendingId]: initialUploadStates(attachmentIds, isRetry ? 'retrying' : 'uploading'),
      }));

      if (!clientSendIdRef.current || !isRetry) {
        clientSendIdRef.current = createConversationClientSendId();
      }

      try {
        await sendAttachment.mutateAsync({
          items: pending.map((item) => ({
            localFile: item.attachment,
            kindHint: item.kindHint,
            prepared: item.prepared,
          })),
          attachmentIds,
          caption: optimisticBody,
          clientSendId: clientSendIdRef.current ?? createConversationClientSendId(),
          shouldCancel: () => cancelUploadRef.current,
          onAttachmentStateChange: (attachmentId, state) => {
            setOutgoingAttachmentState(pendingId, attachmentId, state);
          },
          onUploadProgress: (fraction) => {
            for (const attachmentId of attachmentIds) {
              setOutgoingAttachmentState(pendingId, attachmentId, {
                phase: 'uploading',
                progress: fraction,
              });
            }
          },
          pendingId,
          optimisticBody,
        });
      } catch (error) {
        if (!isConversationUploadCancelledError(error)) {
          setOutgoingUploadByMessageId((current) => {
            const perAttachment = current[pendingId];
            if (!perAttachment) return current;
            const next: Record<string, ConversationAttachmentUploadState> = { ...perAttachment };
            for (const attachmentId of attachmentIds) {
              if (next[attachmentId]?.phase !== 'failed') {
                next[attachmentId] = {
                  phase: 'failed',
                  errorMessage: 'Could not send',
                };
              }
            }
            return { ...current, [pendingId]: next };
          });
        }
        throw error;
      }

      clearOutgoingUploadState(pendingId);
      clientSendIdRef.current = null;
    },
    [clearOutgoingUploadState, conversationId, sendAttachment, setOutgoingAttachmentState, userId],
  );

  const executeComposerSend = async (body: string, pending: ComposerPendingAttachment[]) => {
    if (!conversationId || !userId || sendLockRef.current) return;

    assertConversationMessageSendable(body, pending.length);

    sendLockRef.current = true;
    cancelUploadRef.current = false;
    const pendingId = createPendingMessageId();

    try {
      if (pending.length === 0) {
        await sendText.mutateAsync({ body, pendingId });
      } else {
        scrollToLatest();
        await sendOutgoingAttachments(pendingId, body, pending, false);
        scrollToLatest();
      }
    } catch (error) {
      if (isConversationUploadCancelledError(error)) {
        clearOutgoingUploadState(pendingId);
        clientSendIdRef.current = null;
        showAppToast('Upload cancelled.', { type: 'info' });
      }
      throw error;
    } finally {
      sendLockRef.current = false;
    }
  };

  const onComposerSend = async (body: string, pending: ComposerPendingAttachment[]) => {
    try {
      await gateChatSend(() => executeComposerSend(body, pending));
    } catch (error) {
      if (isChatSendBlockedByProfilePhoto(error)) openCapture();
      else if (!(error instanceof Error && error.message === 'Upload cancelled.')) {
        showAppToast(error instanceof Error ? error.message : 'Could not send.', { type: 'warning' });
      }
    }
  };

  const composerSending = sendText.isPending || sendAttachment.isPending;

  if (!id) {
    return (
      <Screen className="px-5 pt-4">
        <InlineError message="Invalid conversation link." />
      </Screen>
    );
  }

  if (conversation.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading chat…" />
      </Screen>
    );
  }
  if (conversation.isError || !conversation.data) {
    return (
      <Screen className="px-5 pt-4">
        <InlineError
          message={conversation.error instanceof Error ? conversation.error.message : 'Conversation not found.'}
        />
      </Screen>
    );
  }

  const messagingEnabled = conversation.data.messagingEnabled;

  return (
    <Screen className="min-h-[100dvh]">
      <ConversationHeader
        counterpartyName={conversation.data.counterpartyDisplayName}
        counterpartyAvatarPath={conversation.data.counterpartyAvatarPath}
        requestTitle={conversation.data.requestTitle}
        onBack={goBack}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
        {messages.isPending && rows.length === 0 ? (
          <LoadingState label="Loading messages…" />
        ) : null}
        <div className="flex flex-col gap-2">
          {rows.map((message, index) => (
            <div key={message.id} className="flex flex-col">
              {shouldShowChatDaySeparatorChronological(rows, index) ? (
                <ConversationDateSeparator label={formatAgo(message.createdAt)} />
              ) : null}
              {message.attachments?.length ? (
                <AttachmentMessageBubble
                  message={message}
                  isOutgoing={message.senderId === userId}
                  uploadStateByAttachmentId={outgoingUploadByMessageId[message.id]}
                />
              ) : (
                <MessageBubble message={message} isOutgoing={message.senderId === userId} />
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="shrink-0 bg-canvas pb-[max(0px,env(safe-area-inset-bottom))]">
        {messagingEnabled && !photoReady ? (
          <div className="flex flex-col gap-3 border-t border-hairline px-4 pb-2 pt-4">
            <ProfilePhotoCaptureContent
              variant="chat"
              compact
              avatarPath={profile.data?.avatar_path}
              displayName={profile.data?.display_name}
              error={capturePhoto.error}
            />
            <Button
              label={captureButtonLabel}
              size="lg"
              variant="secondary"
              loading={capturePhoto.isPending}
              onClick={openCapture}
            />
          </div>
        ) : null}
        <ConversationComposer
          onSend={onComposerSend}
          sending={composerSending}
          disabled={!messagingEnabled}
          disabledHint="Messaging is read-only for this conversation."
        />
      </div>

      {captureOpen && userId ? (
        <LiveProfilePhotoCapture
          userId={userId}
          onClose={() => setCaptureOpen(false)}
          onSaved={() => {
            setCaptureOpen(false);
            void resumePendingSend();
          }}
        />
      ) : null}
    </Screen>
  );
}