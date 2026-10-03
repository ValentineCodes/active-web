import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { NotificationListItem } from '@/components/notifications/NotificationListItem';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { useTabBarScrollPadding } from '@/components/ui/tab-bar-insets';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import {
  markNotificationInboxItemRead,
  markNotificationInboxRead,
  useNotificationInbox,
  useNotificationUnreadCount,
} from '@/features/notifications/inbox';
import {
  readPushBannerDismissed,
  setPushBannerDismissed,
} from '@/features/notifications/preferences';
import { resolveNotificationHref } from '@/features/notifications/presentation';
import type { InboxNotification } from '@/features/notifications/types';
import { useProfile } from '@/features/profile/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/query/keys';
import {
  openNotificationSettings,
  readPushPermission,
  syncPushToken,
  type PushPermissionState,
} from '@/lib/notifications';

type InboxFilter = 'all' | 'unread';

function InboxFilterTabs({
  value,
  onChange,
}: {
  value: InboxFilter;
  onChange: (next: InboxFilter) => void;
}) {
  return (
    <View className="flex-row rounded-full bg-surface p-1">
      {(['all', 'unread'] as const).map((option) => {
        const selected = value === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option === 'all' ? 'Show all notifications' : 'Show unread only'}
            onPress={() => onChange(option)}
            className={cn(
              'rounded-full px-4 py-2 active:opacity-90',
              selected ? 'bg-elevated' : 'bg-transparent',
            )}
          >
            <Text
              className={cn(
                'text-sm font-semibold capitalize',
                selected ? 'text-ink' : 'text-muted',
              )}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const profile = useProfile();
  const inbox = useNotificationInbox();
  const unread = useNotificationUnreadCount();
  const unreadCount = unread.data ?? 0;
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [permission, setPermission] = useState<PushPermissionState | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const refreshPermissionState = useCallback(() => {
    void readPushPermission().then(setPermission);
    void readPushBannerDismissed().then(setBannerDismissed);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshPermissionState();
    }, [refreshPermissionState]),
  );

  useEffect(() => {
    refreshPermissionState();
  }, [refreshPermissionState]);

  const invalidateInbox = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notificationInbox });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnreadCount });
  }, [queryClient]);

  const pushPrefEnabled = profile.data?.push_notifications_enabled !== false;
  const osGranted = permission?.granted ?? false;
  const pushActive = pushPrefEnabled && osGranted;
  const showPushBanner = pushPrefEnabled && !osGranted && !bannerDismissed && permission !== null;

  const enablePush = async () => {
    setEnabling(true);
    const result = await syncPushToken({ mode: 'user' });
    if (result === 'registered') await setPushBannerDismissed(false);
    refreshPermissionState();
    setEnabling(false);
  };

  const dismissPushBanner = async () => {
    await setPushBannerDismissed(true);
    setBannerDismissed(true);
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    setMarkingAll(true);
    try {
      await markNotificationInboxRead();
      invalidateInbox();
    } finally {
      setMarkingAll(false);
    }
  };

  const openNotification = async (item: InboxNotification) => {
    if (item.readAt === null) {
      await markNotificationInboxItemRead(item.id);
      invalidateInbox();
    }

    const href = resolveNotificationHref({
      type: item.type,
      requestId: item.requestId,
      metadata: item.metadata,
    });
    if (href) router.push(href as never);
  };

  const filteredItems = useMemo(() => {
    if (!inbox.data) return [];
    if (filter === 'unread') return inbox.data.filter((item) => item.readAt === null);
    return inbox.data;
  }, [filter, inbox.data]);

  const unreadLabel =
    unreadCount === 0
      ? 'No new updates'
      : unreadCount === 1
        ? '1 unread update'
        : `${unreadCount} unread updates`;

  const tabBarScrollPadding = useTabBarScrollPadding();

  return (
    <Screen className="flex-1">
      <View className="flex-row items-start justify-between gap-3 px-5 pb-3 pt-2">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-serif text-3xl font-bold text-ink">Notifications</Text>
          <Text className="text-sm text-muted">{unreadLabel}</Text>
        </View>
        <IconButton
          icon="settings-outline"
          variant="surface"
          accessibilityLabel="Notification settings"
          onPress={() => router.push('/notification-settings')}
        />
      </View>

      <View className="flex-row items-center justify-between gap-3 px-5 pb-2">
        <InboxFilterTabs value={filter} onChange={setFilter} />
        {unreadCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
            disabled={markingAll}
            onPress={() => void markAllRead()}
            className="shrink active:opacity-70"
          >
            <Text className="text-sm font-semibold text-active">
              {markingAll ? 'Updating…' : 'Mark all as read'}
            </Text>
          </Pressable>
        ) : (
          <View className="w-28" />
        )}
      </View>

      {inbox.isPending ? <LoadingState /> : null}

      {inbox.isError ? <ErrorState error={inbox.error} onRetry={() => inbox.refetch()} /> : null}

      {inbox.isSuccess ? (
        <FlatList
          className="flex-1"
          data={filteredItems}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-5 pt-1"
          contentContainerStyle={{ paddingBottom: tabBarScrollPadding }}
          scrollIndicatorInsets={{ bottom: tabBarScrollPadding }}
          refreshControl={
            <RefreshControl
              refreshing={inbox.isRefetching}
              onRefresh={() => {
                void inbox.refetch();
              }}
            />
          }
          ItemSeparatorComponent={() => <View className="h-px bg-hairline" />}
          ListEmptyComponent={
            filter === 'unread' && (inbox.data?.length ?? 0) > 0 ? (
              <EmptyState
                icon="checkmark-circle-outline"
                title="You're all caught up"
                message="No unread notifications right now."
              />
            ) : (
              <EmptyState
                icon="notifications-outline"
                title="Nothing yet"
                message="When something needs your attention, it will show up here."
              />
            )
          }
          renderItem={({ item }) => (
            <NotificationListItem item={item} onPress={() => void openNotification(item)} />
          )}
          ListFooterComponent={
            showPushBanner ? (
              <Card className="mt-6 gap-3">
                <Text className="text-base font-semibold text-ink">Get alerts on your phone</Text>
                <Text className="text-sm text-muted">
                  Optional lock-screen alerts for new responses and urgent updates. This list always
                  shows payment, dispute, and other important events.
                </Text>
                {permission?.canAskAgain === false ? (
                  <Button
                    label="Open Settings"
                    variant="secondary"
                    onPress={() => openNotificationSettings()}
                  />
                ) : (
                  <Button
                    label="Enable push notifications"
                    loading={enabling}
                    onPress={() => void enablePush()}
                  />
                )}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void dismissPushBanner()}
                  className="self-center active:opacity-70"
                >
                  <Text className="text-sm font-semibold text-muted">Not now</Text>
                </Pressable>
              </Card>
            ) : !pushActive && pushPrefEnabled === false ? (
              <Card className="mt-6 gap-2">
                <Text className="text-sm text-muted">
                  Push alerts are off. You still receive all important updates here.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/notification-settings')}
                  className="self-start active:opacity-80"
                >
                  <Text className="text-sm font-semibold text-active">Manage in settings</Text>
                </Pressable>
              </Card>
            ) : undefined
          }
        />
      ) : null}
    </Screen>
  );
}
