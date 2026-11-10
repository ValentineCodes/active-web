import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { InlineError } from '@/components/ui/StateView';
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
  const { id = '' } = useParams();
  const userId = useUserId();
  const conversation = useResolvedRequestConversation(id);
  const conversationId = conversation.data?.conversationId;
  const requestId = conversation.data?.requestId ?? '';
  const messages = useRequestMessages(conversationId);
  const sendText = useSendRequestMessage(conversationId ?? '', requestId);
  const { gateChatSend, photoReady, runCapture, isChatSendBlockedByProfilePhoto } = useChatSendGate();
  const [body, setBody] = useState('');
  const [focused, setFocused] = useState(true);

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

  const onSend = async (event: FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!text || !conversationId || !userId) return;
    try {
      await gateChatSend(async () => {
        await sendText.mutateAsync({ body: text, pendingId: createPendingMessageId() });
        setBody('');
      });
    } catch (error) {
      if (isChatSendBlockedByProfilePhoto(error)) {
        runCapture();
      } else {
        showAppToast(error instanceof Error ? error.message : 'Could not send.', 'warning');
      }
    }
  };

  const attachPhotos = async () => {
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
            caption: body.trim() || null,
          });
        }
        setBody('');
        void messages.refetch();
      });
    } catch (error) {
      if (isChatSendBlockedByProfilePhoto(error)) runCapture();
    }
  };

  const attachFile = async () => {
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
          caption: body.trim() || null,
        });
        setBody('');
        void messages.refetch();
      });
    } catch (error) {
      if (isChatSendBlockedByProfilePhoto(error)) runCapture();
    }
  };

  if (conversation.isLoading) return <p className="text-sm text-subtle">Loading chat…</p>;
  if (conversation.isError || !conversation.data) {
    return (
      <InlineError
        message={conversation.error instanceof Error ? conversation.error.message : 'Conversation not found.'}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-3 bg-canvas px-5 py-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link to="/messages" className="text-sm font-semibold text-brand">
          Back
        </Link>
        <h1 className="truncate text-lg font-semibold text-ink">{conversation.data.requestTitle}</h1>
      </header>

      {!photoReady ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">
          Live profile photo required to send messages.{' '}
          <button type="button" className="font-semibold text-brand" onClick={runCapture}>
            Take photo
          </button>
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-2xl border border-hairline bg-elevated p-3">
        {rows.map((message, index) => (
          <div key={message.id}>
            {shouldShowChatDaySeparator(rows, index) ? (
              <p className="my-2 text-center text-[10px] uppercase tracking-wide text-subtle">
                {formatAgo(message.createdAt)}
              </p>
            ) : null}
            <div
              className={`mb-2 max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                message.senderId === userId ? 'ml-auto bg-brand text-on-brand' : 'bg-surface text-ink'
              }`}
            >
              {message.body ? <p>{message.body}</p> : null}
              {message.attachments?.length ? (
                <ul className="mt-1 text-xs opacity-90">
                  {message.attachments.map((a) => (
                    <li key={a.id}>{a.fileName ?? a.attachmentType}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={onSend} className="flex flex-col gap-2">
        <textarea
          className="min-h-20 rounded-2xl border border-hairline bg-surface px-4 py-3 text-base text-ink"
          placeholder="Message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={!conversation.data.messagingEnabled}
        />
        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={sendText.isPending || !conversation.data.messagingEnabled}
            className="rounded-2xl bg-brand px-5 py-3.5 text-base font-semibold text-on-brand disabled:opacity-50"
          >
            {sendText.isPending ? 'Sending…' : 'Send'}
          </button>
          <div className="flex gap-2">
            <Button label="Photos" variant="secondary" onClick={() => void attachPhotos()} />
            <Button label="File" variant="secondary" onClick={() => void attachFile()} />
          </div>
        </div>
      </form>
    </div>
  );
}
