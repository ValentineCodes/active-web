import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Platform, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import {
  ConversationComposer,
  composerPendingFromOutgoingMessage,
  type ComposerPendingAttachment,
} from '@/components/conversation/ConversationComposer';
import { ConversationHeader } from '@/components/conversation/ConversationHeader';
import { ConversationHeaderActions } from '@/components/conversation/ConversationHeaderActions';
import { ConversationDateSeparator } from '@/components/conversation/ConversationDateSeparator';
import { ConversationMessageItem } from '@/components/conversation/ConversationMessageItem';
import { shouldShowChatDaySeparator } from '@/features/requests/chat-day-separators';
import { ProfilePhotoCaptureContent } from '@/components/profile/ProfilePhotoCaptureContent';
import { Button } from '@/components/ui/Button';
import { KeyboardStickyFooter } from '@/components/ui/KeyboardStickyFooter';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, LoadingState } from '@/components/ui/StateView';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import { useUserId } from '@/features/auth/session';
import { useMarkConversationReadWhenVisible } from '@/features/requests/conversation-inbox-api';
import {
  createPendingMessageId,
  removeMessageFromCache,
  useLiveConversationMessages,
  useRequestConversationFocus,
  useRequestMessages,
  useResolvedRequestConversation,
  useSendRequestMessage,
  useSendRequestMessageAttachment,
  type RequestMessage,
} from '@/features/requests/conversation-api';
import { abortConversationAttachmentMessage } from '@/features/requests/conversation-attachment-upload';
import {
  assertConversationMessageSendable,
  createConversationClientSendId,
} from '@/features/requests/conversation-message-send';
import {
  initialUploadStates,
  isConversationUploadCancelledError,
  type ConversationAttachmentUploadState,
} from '@/features/requests/conversation-attachment-upload-state';
import { showAppToast } from '@/lib/toast';
import { useEngagement } from '@/features/requests/requester-api';
import { useChatSendGate } from '@/features/profile/use-chat-send-gate';
import { queryKeys } from '@/lib/query/keys';
import { useColors } from '@/theme';

function outgoingMessageUploadFailed(
  states: Record<string, ConversationAttachmentUploadState> | undefined,
): boolean {
  if (!states) return false;
  return Object.values(states).some((state) => state.phase === 'failed');
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useUserId();
  const colors = useColors();
  const listRef = useRef<FlatList<RequestMessage>>(null);
  const queryClient = useQueryClient();
  const navigation = useNavigation();

  const conversation = useResolvedRequestConversation(id);
  const conversationId = conversation.data?.conversationId;
  const requestId = conversation.data?.requestId ?? '';
  const engagement = useEngagement(
    requestId,
    Boolean(conversation.data && !conversation.data.isPreHandshake),
  );

  const messagesQuery = useRequestMessages(conversationId);
  useQueryErrorToast(conversation, { enabled: conversation.isError });
  useQueryErrorToast(engagement, {
    enabled: Boolean(conversation.data && !conversation.data.isPreHandshake && engagement.isError),
  });
  useQueryErrorToast(messagesQuery, {
    enabled: Boolean(conversationId && messagesQuery.isError),
  });
  const sendMessage = useSendRequestMessage(conversationId ?? '', requestId);
  const sendAttachment = useSendRequestMessageAttachment(conversationId ?? '', requestId);
  const {
    profile,
    photoReady,
    capturePhoto,
    permissionBlocked,
    captureButtonLabel,
    gateChatSend,
    runCapture,
    openCameraSettings,
  } = useChatSendGate();
  const [threadFocused, setThreadFocused] = useState(false);

  const threadVisible =
    threadFocused && Boolean(conversationId) && messagesQuery.isSuccess && !messagesQuery.isPending;

  useLiveConversationMessages(
    conversationId,
    requestId,
    threadVisible,
    conversation.data?.counterpartyDisplayName ?? engagement.data?.counterparty_display_name,
  );
  useMarkConversationReadWhenVisible(conversationId, userId, threadVisible);
  useRequestConversationFocus(conversationId, threadVisible);

  const sendLockRef = useRef(false);
  const cancelUploadRef = useRef(false);
  const clientSendIdRef = useRef<string | null>(null);
  const reservedServerMessageIdRef = useRef<Record<string, string>>({});
  const [outgoingUploadByMessageId, setOutgoingUploadByMessageId] = useState<
    Record<string, Record<string, ConversationAttachmentUploadState>>
  >({});

  const clearOutgoingUploadState = useCallback((messageId: string) => {
    setOutgoingUploadByMessageId((current) => {
      if (!current[messageId]) return current;
      const next = { ...current };
      delete next[messageId];
      return next;
    });
    delete reservedServerMessageIdRef.current[messageId];
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

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      // `inactive` fires for keyboard, Control Center, etc. — only cancel when app backgrounds.
      if (nextState === 'background' && sendLockRef.current) {
        cancelUploadRef.current = true;
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      if (sendLockRef.current) {
        cancelUploadRef.current = true;
      }
    });
    return unsubscribe;
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      setThreadFocused(true);
      if (!conversationId) return;
      void queryClient.refetchQueries({
        queryKey: queryKeys.requestMessages(conversationId),
        type: 'active',
      });
      return () => {
        setThreadFocused(false);
      };
    }, [conversationId, queryClient]),
  );

  const loadOlder = useCallback(() => {
    if (!messagesQuery.hasNextPage || messagesQuery.isFetchingNextPage) return;
    void messagesQuery.fetchNextPage();
  }, [messagesQuery]);

  const scrollToLatest = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const sendOutgoingAttachments = useCallback(
    async (
      pendingId: string,
      body: string,
      pending: ComposerPendingAttachment[],
      isRetry: boolean,
    ) => {
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
          onMessageReserved: (serverMessageId) => {
            reservedServerMessageIdRef.current[pendingId] = serverMessageId;
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
        await sendMessage.mutateAsync({ body, pendingId });
      } else {
        scrollToLatest();
        await sendOutgoingAttachments(pendingId, body, pending, false);
      }
      scrollToLatest();
    } catch (error) {
      if (isConversationUploadCancelledError(error)) {
        clearOutgoingUploadState(pendingId);
        clientSendIdRef.current = null;
        showAppToast('Upload cancelled.', 'info');
      }
      throw error;
    } finally {
      sendLockRef.current = false;
    }
  };

  const onComposerSend = async (body: string, pending: ComposerPendingAttachment[]) => {
    await gateChatSend(() => executeComposerSend(body, pending));
  };

  const retryOutgoingMessage = useCallback(
    async (message: RequestMessage) => {
      if (!conversationId || sendLockRef.current) return;

      sendLockRef.current = true;
      cancelUploadRef.current = false;

      try {
        const pending = composerPendingFromOutgoingMessage(message);
        await sendOutgoingAttachments(message.id, message.body, pending, true);
        scrollToLatest();
      } catch (error) {
        if (isConversationUploadCancelledError(error)) {
          clearOutgoingUploadState(message.id);
          clientSendIdRef.current = null;
          showAppToast('Upload cancelled.', 'info');
        }
      } finally {
        sendLockRef.current = false;
      }
    },
    [clearOutgoingUploadState, conversationId, sendOutgoingAttachments],
  );

  const deleteOutgoingMessage = useCallback(
    async (message: RequestMessage) => {
      if (!conversationId) return;

      cancelUploadRef.current = true;
      const serverMessageId = reservedServerMessageIdRef.current[message.id];
      removeMessageFromCache(queryClient, conversationId, message.id);
      clearOutgoingUploadState(message.id);

      if (serverMessageId) {
        try {
          await abortConversationAttachmentMessage(serverMessageId);
        } catch {
          showAppToast('Could not remove this message.', 'warning');
        }
      }
    },
    [clearOutgoingUploadState, conversationId, queryClient],
  );

  const messagingEnabled = conversation.data?.messagingEnabled ?? false;
  const isPreHandshake = conversation.data?.isPreHandshake ?? false;
  const composerSending = sendMessage.isPending;
  const messages = messagesQuery.messages;

  const renderMessage = useCallback(
    ({ item, index }: { item: RequestMessage; index: number }) => (
      <View className="gap-3">
        {shouldShowChatDaySeparator(messages, index) ? (
          <ConversationDateSeparator iso={item.createdAt} />
        ) : null}
        <ConversationMessageItem
          message={item}
          isOutgoing={item.senderId === userId}
          outgoingUploadStateByAttachmentId={outgoingUploadByMessageId[item.id]}
          onRetryOutgoing={
            outgoingMessageUploadFailed(outgoingUploadByMessageId[item.id])
              ? () => void gateChatSend(() => retryOutgoingMessage(item))
              : undefined
          }
          onDeleteOutgoing={
            outgoingMessageUploadFailed(outgoingUploadByMessageId[item.id])
              ? () => void deleteOutgoingMessage(item)
              : undefined
          }
        />
      </View>
    ),
    [
      deleteOutgoingMessage,
      gateChatSend,
      messages,
      outgoingUploadByMessageId,
      retryOutgoingMessage,
      userId,
    ],
  );

  const listFooter = useCallback(
    () => (
      <View className="gap-2">
        {!messagingEnabled ? (
          <View className="mb-2 rounded-xl border border-hairline bg-elevated px-4 py-3">
            <Text className="text-center text-sm text-muted">
              {isPreHandshake
                ? 'This discussion is closed. You can read past messages here.'
                : 'This request is closed. You can read past messages here.'}
            </Text>
          </View>
        ) : null}
        {messagesQuery.isFetchingNextPage ? (
          <View className="items-center py-2">
            <ActivityIndicator color={colors.active} />
          </View>
        ) : null}
      </View>
    ),
    [colors.active, isPreHandshake, messagesQuery.isFetchingNextPage, messagingEnabled],
  );

  const awaitingEngagement =
    conversation.data && !conversation.data.isPreHandshake && engagement.isPending;

  if (conversation.isPending || awaitingEngagement) {
    return (
      <Screen edges={['top']}>
        <ConversationHeader
          counterpartyName={null}
          counterpartyAvatarPath={null}
          requestTitle="Loading…"
          onBack={() => router.back()}
        />
        <LoadingState />
      </Screen>
    );
  }

  if (!conversation.data) {
    return (
      <Screen edges={['top']}>
        <ConversationHeader
          counterpartyName={null}
          counterpartyAvatarPath={null}
          requestTitle="Chat"
          onBack={() => router.back()}
        />
        <EmptyState
          icon="lock-closed-outline"
          title={conversation.isError ? 'Could not load chat' : 'Chat not available'}
          message={
            conversation.isError
              ? 'Go back and open this conversation again.'
              : 'This conversation is not available or you do not have access to it.'
          }
          action={{ label: 'Go back', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  if (!conversation.data.isPreHandshake && engagement.isSuccess && !engagement.data) {
    return <Redirect href={`/request/${requestId}`} />;
  }

  const thread = conversation.data;
  const counterpartyId = thread.counterpartyId;
  const viewerIsResponder = userId === thread.selectedUserId;
  const awaitingRequesterMessage =
    thread.isPreHandshake && !thread.messagingEnabled && viewerIsResponder;
  const headerStatusLabel =
    thread.isPreHandshake && !thread.messagingEnabled
      ? awaitingRequesterMessage
        ? 'Waiting for them to message you'
        : 'This discussion is closed'
      : null;

  return (
    <Screen edges={['top']} className="flex-1">
      <ConversationHeader
        counterpartyName={thread.counterpartyDisplayName}
        counterpartyAvatarPath={thread.counterpartyAvatarPath}
        counterpartyIdentityVerified={thread.counterpartyIdentityVerified}
        requestTitle={thread.requestTitle}
        statusLabel={headerStatusLabel}
        onBack={() => router.back()}
        actions={
          thread.isPreHandshake ? null : (
            <ConversationHeaderActions
              conversationId={thread.conversationId}
              requestId={requestId}
              counterpartyId={counterpartyId}
            />
          )
        }
      />

      <KeyboardStickyFooter
        className="flex-1"
        footer={
          <View>
            {thread.messagingEnabled && !photoReady ? (
              <View className="gap-3 border-t border-hairline px-4 pb-2 pt-4">
                <ProfilePhotoCaptureContent
                  variant="chat"
                  compact
                  avatarPath={profile.data?.avatar_path}
                  displayName={profile.data?.display_name}
                  error={capturePhoto.isError ? capturePhoto.error : null}
                  permissionBlocked={permissionBlocked}
                />
                <Button
                  label={captureButtonLabel}
                  size="lg"
                  variant="secondary"
                  loading={capturePhoto.isPending}
                  icon={permissionBlocked ? 'settings-outline' : undefined}
                  onPress={() => {
                    if (permissionBlocked) {
                      openCameraSettings();
                      return;
                    }
                    void runCapture();
                  }}
                />
              </View>
            ) : null}
            <ConversationComposer
              onSend={onComposerSend}
              sending={composerSending}
              disabled={!thread.messagingEnabled}
              disabledHint={
                awaitingRequesterMessage
                  ? 'You can reply after they send a message'
                  : thread.isPreHandshake
                    ? 'This discussion is closed'
                    : 'This request is closed'
              }
            />
          </View>
        }
      >
        {messagesQuery.isPending ? (
          <LoadingState label="Loading messages" />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            inverted
            automaticallyAdjustKeyboardInsets={false}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={18}
            maxToRenderPerBatch={12}
            windowSize={9}
            removeClippedSubviews={Platform.OS === 'android'}
            maintainVisibleContentPosition={
              messages.length > 0
                ? { minIndexForVisible: 0, autoscrollToTopThreshold: 24 }
                : undefined
            }
            contentContainerClassName="gap-3 px-4 py-4"
            contentContainerStyle={
              messages.length === 0 ? { flexGrow: 1, justifyContent: 'center' } : undefined
            }
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            ListEmptyComponent={
              <View className="items-center px-6">
                <Text className="text-center text-base text-muted">
                  {messagingEnabled
                    ? 'Coordinate timing, location, and any last details for this request.'
                    : awaitingRequesterMessage
                      ? 'They will message you here when they want to discuss this request.'
                      : 'No messages in this conversation yet.'}
                </Text>
              </View>
            }
            ListFooterComponent={listFooter}
            renderItem={renderMessage}
          />
        )}
      </KeyboardStickyFooter>
    </Screen>
  );
}
