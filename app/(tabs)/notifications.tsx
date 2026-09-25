import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { formatDistanceToNowStrict } from 'date-fns';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, LoadingState } from '@/components/ui/StateView';
import { useNotificationInbox } from '@/features/notifications/inbox';
import { syncPushToken } from '@/lib/notifications';

export default function NotificationsScreen() {
  const inbox = useNotificationInbox();
  const [permission, setPermission] = useState<Notifications.PermissionStatus | null>(null);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    void Notifications.getPermissionsAsync().then((result) => setPermission(result.status));
  }, []);

  const enableNotifications = async () => {
    setEnabling(true);
    await syncPushToken({ prompt: true });
    const result = await Notifications.getPermissionsAsync();
    setPermission(result.status);
    setEnabling(false);
  };

  const notificationsEnabled = permission === Notifications.PermissionStatus.GRANTED;

  return (
    <Screen>
      <View className="gap-1 p-5 pb-2">
        <Text className="text-3xl font-bold text-ink">Notifications</Text>
        <Text className="text-base text-muted">
          Responses, matches, and updates from your requests and Activity.
        </Text>
      </View>

      {!notificationsEnabled ? (
        <View className="px-5 pb-3">
          <Card>
            <Text className="text-base font-semibold text-ink">Turn on push notifications</Text>
            <Text className="text-sm text-muted">
              You will get a ping when someone responds, when you are chosen for a job, or when a
              nearby request matches what you offer.
            </Text>
            <Button
              label="Enable notifications"
              loading={enabling}
              onPress={() => void enableNotifications()}
            />
          </Card>
        </View>
      ) : null}

      {inbox.isPending ? <LoadingState /> : null}

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
              message="When something needs your attention, it will show up here and on your lock screen if notifications are on."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                if (item.url) router.push(item.url as never);
              }}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              className="rounded-3xl bg-surface p-4 active:opacity-80"
            >
              <View className="flex-row items-start justify-between gap-2">
                <Text className="flex-1 text-base font-semibold text-ink">{item.title}</Text>
                <Text className="text-xs text-subtle">
                  {formatDistanceToNowStrict(new Date(item.receivedAt))} ago
                </Text>
              </View>
              {item.body ? <Text className="text-sm text-muted">{item.body}</Text> : null}
            </Pressable>
          )}
        />
      ) : null}
    </Screen>
  );
}
