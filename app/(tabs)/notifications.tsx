import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { NotificationListItem } from '@/components/notifications/NotificationListItem';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
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
import { queryKeys } from '@/lib/query/keys';
import {
  openNotificationSettings,
  readPushPermission,
  syncPushToken,
  type PushPermissionState,
} from '@/lib/notifications';
import { useQueryClient } from '@tanstack/react-query';

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const profile = useProfile();
  const inbox = useNotificationInbox();
  const unread = useNotificationUnreadCount();
  const unreadCount = unread.data ?? 0;
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

  return (
    <Screen>
      <View className="flex-row items-start justify-between gap-3 p-5 pb-2">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-3xl font-bold text-ink">Notifications</Text>
          <Text className="text-base text-muted">
            Updates about your requests, responses, payments, and help in progress.
          </Text>
        </View>
        <View className="items-end gap-2">
          {unreadCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mark all notifications as read"
              disabled={markingAll}
              onPress={() => void markAllRead()}
              className="rounded-full px-2 py-1 active:opacity-70"
            >
              <Text className="text-sm font-semibold text-brand">
                {markingAll ? 'Updating…' : 'Mark all read'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notification settings"
            onPress={() => router.push('/notification-settings')}
            className="rounded-full px-2 py-1 active:opacity-70"
          >
            <Text className="text-sm font-semibold text-brand">Settings</Text>
          </Pressable>
        </View>
      </View>

      {inbox.isPending ? <LoadingState /> : null}

      {inbox.isError ? <ErrorState error={inbox.error} onRetry={() => inbox.refetch()} /> : null}

      {inbox.isSuccess ? (
        <FlatList
          data={inbox.data}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-3 p-5 pt-2 pb-12"
          refreshControl={
            <RefreshControl refreshing={inbox.isRefetching} onRefresh={() => inbox.refetch()} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title="Nothing yet"
              message="When something needs your attention, it will show up here."
            />
          }
          renderItem={({ item }) => (
            <NotificationListItem item={item} onPress={() => void openNotification(item)} />
          )}
          ListFooterComponent={
            showPushBanner ? (
              <Card className="mt-2 gap-3">
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
              <Card className="mt-2 gap-2">
                <Text className="text-sm text-muted">
                  Push alerts are off. You still receive all important updates here.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/notification-settings')}
                  className="self-start active:opacity-80"
                >
                  <Text className="text-sm font-semibold text-brand">Manage in settings</Text>
                </Pressable>
              </Card>
            ) : null
          }
        />
      ) : null}
    </Screen>
  );
}
