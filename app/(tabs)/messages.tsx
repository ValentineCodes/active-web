import { useCallback } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { ConversationListItem } from '@/components/conversation/ConversationListItem';
import { Screen } from '@/components/ui/Screen';
import { useTabBarScrollPadding } from '@/components/ui/tab-bar-insets';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import { useConversationInbox } from '@/features/requests/conversation-inbox-api';

export default function MessagesScreen() {
  const inbox = useConversationInbox();
  const tabBarScrollPadding = useTabBarScrollPadding();

  const { refetch } = inbox;

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const unreadLabel = inbox.data?.reduce((total, row) => total + row.unreadCount, 0) ?? 0;
  const subtitle =
    unreadLabel === 0
      ? 'No unread messages'
      : unreadLabel === 1
        ? '1 unread message'
        : `${unreadLabel} unread messages`;

  const isEmpty = inbox.isSuccess && (inbox.data?.length ?? 0) === 0;

  return (
    <Screen className="flex-1">
      <View className="gap-1 px-5 pb-3 pt-2">
        <Text className="text-3xl font-bold text-ink">Messages</Text>
        <Text className="text-sm text-muted">{subtitle}</Text>
      </View>

      {inbox.isPending ? <LoadingState /> : null}

      {inbox.isError ? <ErrorState error={inbox.error} onRetry={() => inbox.refetch()} /> : null}

      {inbox.isSuccess ? (
        <FlatList
          className="flex-1"
          data={inbox.data}
          keyExtractor={(item) => item.conversationId}
          contentContainerClassName="px-5 pt-1"
          contentContainerStyle={{
            paddingBottom: tabBarScrollPadding,
            ...(isEmpty ? { flexGrow: 1, justifyContent: 'center' as const } : undefined),
          }}
          scrollIndicatorInsets={{ bottom: tabBarScrollPadding }}
          refreshControl={
            <RefreshControl
              refreshing={inbox.isRefetching}
              onRefresh={() => void inbox.refetch()}
            />
          }
          ItemSeparatorComponent={() => <View className="h-px bg-hairline" />}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title="Nothing here yet"
              message="After you select someone on a request, your chat with them will show up here."
            />
          }
          renderItem={({ item }) => (
            <ConversationListItem
              item={item}
              onPress={() => router.push(`/conversation/${item.requestId}`)}
            />
          )}
        />
      ) : null}
    </Screen>
  );
}
