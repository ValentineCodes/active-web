'use client';

import { parseConversationReturnTo } from '@/lib/conversation-navigation';
import { useRouter, useSearchParams } from '@/lib/navigation';
import { useEffect, useState } from 'react';

import { LiveProfilePhotoCapture } from '@/components/profile/LiveProfilePhotoCapture';
import { ProfilePhotoCaptureContent } from '@/components/profile/ProfilePhotoCaptureContent';
import { ConversationComposer } from '@/components/conversation/ConversationComposer';
import { ConversationDateSeparator } from '@/components/conversation/ConversationDateSeparator';
import { ConversationHeader } from '@/components/conversation/ConversationHeader';
import { AttachmentMessageBubble } from '@/components/conversation/AttachmentMessageBubble';
import { MessageBubble } from '@/components/conversation/MessageBubble';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { InlineError, LoadingState } from '@/components/ui/StateView';
import { useRouteParam } from '@/lib/route-param';
import { useUserId } from '@/features/auth/use-user-id';
import { useChatSendGate } from '@/features/profile/use-chat-send-gate';
import { uploadConversationChatAttachment } from '@/features/requests/conversation-attachment-upload';
import { shouldShowChatDaySeparator } from '@/features/requests/chat-day-separators';
import {
  createPendingMessageId,
  useLiveConversationMessages,
  useResolvedRequestConversation,
  useRequestMessages,
  useSendRequestMessage,
} from '@/features/requests/conversation-api';
import { chooseConversationFile, pickConversationPhotosFromLibrary } from '@/features/requests/conversation-media';
import { formatAgo } from '@/lib/format';
import { showAppToast } from '@/lib/toast';

export function ConversationPage() {
  const router = useRouter();
  const search = useSearchParams();
  const id = useRouteParam('id');
  const returnTo = parseConversationReturnTo(search.get('returnTo'));

  const goBack = () => {
    if (returnTo) router.push(returnTo);
    else router.back();
  };
  const userId = useUserId();
  const conversation = useResolvedRequestConversation(id);
  const conversationId = conversation.data?.conversationId;
  const requestId = conversation.data?.requestId ?? '';
  const messages = useRequestMessages(conversationId);
  const sendText = useSendRequestMessage(conversationId ?? '', requestId);
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
  const [attachOpen, setAttachOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);

  const openCapture = () => setCaptureOpen(true);

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

  const rows = messages.messages ?? [];

  const onSend = async (body: string) => {
    if (!body || !conversationId || !userId) return;
    try {
      await gateChatSend(async () => {
        await sendText.mutateAsync({ body, pendingId: createPendingMessageId() });
      });
    } catch (error) {
      if (isChatSendBlockedByProfilePhoto(error)) openCapture();
      else showAppToast(error instanceof Error ? error.message : 'Could not send.', { type: 'warning' });
    }
  };

  const attachPhotos = async () => {
    setAttachOpen(false);
    if (!conversationId || !userId) return;
    try {
      const picks = await pickConversationPhotosFromLibrary(3);
      if (picks.length === 0) return;
      await gateChatSend(async () => {
        for (const pick of picks) {
          await uploadConversationChatAttachment({
            conversationId,
            userId,
            localFile: pick,
            kindHint: 'image',
            caption: null,
          });
        }
        void messages.refetch();
      });
    } catch (error) {
      if (isChatSendBlockedByProfilePhoto(error)) openCapture();
    }
  };

  const attachFile = async () => {
    setAttachOpen(false);
    if (!conversationId || !userId) return;
    try {
      const pick = await chooseConversationFile();
      if (!pick) return;
      await gateChatSend(async () => {
        await uploadConversationChatAttachment({
          conversationId,
          userId,
          localFile: pick,
          kindHint: 'file',
          caption: null,
        });
        void messages.refetch();
      });
    } catch (error) {
      if (isChatSendBlockedByProfilePhoto(error)) openCapture();
    }
  };

  if (conversation.isLoading) {
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
        <div className="flex flex-col gap-2">
          {rows.map((message, index) => (
            <div key={message.id} className="flex flex-col">
              {shouldShowChatDaySeparator(rows, index) ? (
                <ConversationDateSeparator label={formatAgo(message.createdAt)} />
              ) : null}
              {message.attachments?.length ? (
                <AttachmentMessageBubble message={message} isOutgoing={message.senderId === userId} />
              ) : (
                <MessageBubble message={message} isOutgoing={message.senderId === userId} />
              )}
            </div>
          ))}
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
          onSend={onSend}
          sending={sendText.isPending}
          disabled={!messagingEnabled}
          disabledHint="Messaging is read-only for this conversation."
          onAttach={() => setAttachOpen(true)}
        />
      </div>

      <BottomSheet open={attachOpen} title="Attach" onClose={() => setAttachOpen(false)}>
        <div className="flex flex-col gap-2 py-2">
          <Button label="Photos" variant="secondary" onClick={() => void attachPhotos()} />
          <Button label="File" variant="secondary" onClick={() => void attachFile()} />
        </div>
      </BottomSheet>

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
