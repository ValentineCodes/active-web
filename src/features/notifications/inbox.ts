import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';

const STORAGE_KEY = 'active-notification-inbox';
const INBOX_LIMIT = 50;

export type InboxNotification = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  receivedAt: string;
};

async function readInbox(): Promise<InboxNotification[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  const parsed = JSON.parse(raw) as InboxNotification[];
  return Array.isArray(parsed) ? parsed : [];
}

async function writeInbox(items: InboxNotification[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, INBOX_LIMIT)));
}

export function inboxItemFromNotification(
  notification: Notifications.Notification,
): InboxNotification {
  const content = notification.request.content;
  const url = content.data?.url;
  return {
    id: notification.request.identifier,
    title: content.title ?? 'Active',
    body: content.body ?? '',
    url: typeof url === 'string' ? url : null,
    receivedAt: new Date(notification.date).toISOString(),
  };
}

export async function appendInboxItem(item: InboxNotification) {
  const existing = await readInbox();
  const withoutDuplicate = existing.filter((entry) => entry.id !== item.id);
  await writeInbox([item, ...withoutDuplicate]);
}

export function useNotificationInbox() {
  return useQuery({
    queryKey: queryKeys.notificationInbox,
    queryFn: readInbox,
  });
}

export function useRefreshNotificationInbox() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.notificationInbox });
}
