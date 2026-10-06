import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { ConversationComposer } from '@/components/conversation/ConversationComposer';
import { ConversationHeader } from '@/components/conversation/ConversationHeader';
import { ConversationHeaderActions } from '@/components/conversation/ConversationHeaderActions';
import { ConversationMessageItem } from '@/components/conversation/ConversationMessageItem';
import { KeyboardStickyFooter } from '@/components/ui/KeyboardStickyFooter';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import { useUserId } from '@/features/auth/session';
import { useMarkConversationReadWhenVisible } from '@/features/requests/conversation-inbox-api';
import {
  createPendingMessageId,
  useLiveConversationMessages,
  useRequestConversation,
  useRequestConversationFocus,
  useRequestMessages,
  useSendRequestMessage,
  type RequestMessage,
} from '@/features/requests/conversation-api';
import { useEngagement } from '@/features/requests/requester-api';
import { queryKeys } from '@/lib/query/keys';
import { useColors } from '@/theme';

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useUserId();
  const colors = useColors();
  const listRef = useRef<FlatList<RequestMessage>>(null);
  const queryClient = useQueryClient();

  const engagement = useEngagement(id);
  const conversation = useRequestConversation(id);
  const conversationId = conversation.data?.conversationId;

  const messagesQuery = useRequestMessages(conversationId);
  const sendMessage = useSendRequestMessage(conversationId ?? '', id);
  const [threadFocused, setThreadFocused] = useState(false);

  const threadVisible =
    threadFocused && Boolean(conversationId) && messagesQuery.isSuccess && !messagesQuery.isPending;

  useLiveConversationMessages(
    conversationId,
    id,
    threadVisible,
    engagement.data?.counterparty_display_name,
  );
  useMarkConversationReadWhenVisible(conversationId, userId, threadVisible);
  useRequestConversationFocus(conversationId, threadVisible);

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

  const onSend = (body: string) => {
    const pendingId = createPendingMessageId();
    sendMessage.mutate(
      { body, pendingId },
      {
        onSuccess: () => {
          listRef.current?.scrollToOffset({ offset: 0, animated: true });
        },
      },
    );
  };

  const messagingEnabled = conversation.data?.messagingEnabled ?? false;
  const messages = messagesQuery.messages;

  const renderMessage = useCallback(
    ({ item }: { item: RequestMessage }) => (
      <ConversationMessageItem message={item} isOutgoing={item.senderId === userId} />
    ),
    [userId],
  );

  const listFooter = useCallback(
    () => (
      <View className="gap-2">
        {!messagingEnabled ? (
          <View className="mb-2 rounded-xl border border-hairline bg-elevated px-4 py-3">
            <Text className="text-center text-sm text-muted">
              This request is closed. You can read past messages here.
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
    [colors.active, messagesQuery.isFetchingNextPage, messagingEnabled],
  );

  if (engagement.isPending || conversation.isPending) {
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

  if (engagement.isError) {
    return (
      <Screen edges={['top']}>
        <ConversationHeader
          counterpartyName={null}
          counterpartyAvatarPath={null}
          requestTitle="Chat"
          onBack={() => router.back()}
        />
        <ErrorState error={engagement.error} onRetry={() => engagement.refetch()} />
      </Screen>
    );
  }

  if (!engagement.data) {
    return <Redirect href={`/request/${id}`} />;
  }

  if (conversation.isError) {
    return (
      <Screen edges={['top']}>
        <ConversationHeader
          counterpartyName={engagement.data.counterparty_display_name}
          counterpartyAvatarPath={engagement.data.counterparty_avatar_path}
          requestTitle={engagement.data.title}
          onBack={() => router.back()}
        />
        <ErrorState error={conversation.error} onRetry={() => conversation.refetch()} />
      </Screen>
    );
  }

  if (!conversation.data) {
    return (
      <Screen edges={['top']}>
        <ConversationHeader
          counterpartyName={engagement.data.counterparty_display_name}
          counterpartyAvatarPath={engagement.data.counterparty_avatar_path}
          requestTitle={engagement.data.title}
          onBack={() => router.back()}
        />
        <EmptyState
          icon="lock-closed-outline"
          title="Chat not available"
          message="Chat opens once you’ve selected someone to help with this request."
          action={{ label: 'Go back', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const data = engagement.data;
  const thread = conversation.data;
  const counterpartyId = userId === thread.requesterId ? thread.selectedUserId : thread.requesterId;

  return (
    <Screen edges={['top']} className="flex-1">
      <ConversationHeader
        counterpartyName={data.counterparty_display_name}
        counterpartyAvatarPath={data.counterparty_avatar_path}
        requestTitle={data.title}
        onBack={() => router.back()}
        actions={
          <ConversationHeaderActions
            conversationId={thread.conversationId}
            requestId={id}
            counterpartyId={counterpartyId}
          />
        }
      />

      <KeyboardStickyFooter
        className="flex-1"
        footer={
          <ConversationComposer
            onSend={onSend}
            sending={sendMessage.isPending}
            disabled={!thread.messagingEnabled}
            disabledHint="This request is closed"
          />
        }
      >
        {messagesQuery.isPending ? (
          <LoadingState label="Loading messages" />
        ) : messagesQuery.isError ? (
          <ErrorState error={messagesQuery.error} onRetry={() => messagesQuery.refetch()} />
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
