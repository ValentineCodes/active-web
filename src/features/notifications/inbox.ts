import { useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

const INBOX_LIMIT = 50;

export type InboxNotification = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  receivedAt: string;
  readAt: string | null;
};

async function fetchInbox(): Promise<InboxNotification[]> {
  const { data, error } = await supabase
    .from('notification_inbox')
    .select('id, title, body, url, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(INBOX_LIMIT);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    url: row.url,
    receivedAt: row.created_at,
    readAt: row.read_at,
  }));
}

async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notification_inbox')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);

  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationInboxRead(): Promise<void> {
  const { error } = await supabase.rpc('mark_notification_inbox_read');
  if (error) throw error;
}

export function useNotificationInbox() {
  return useQuery({
    queryKey: queryKeys.notificationInbox,
    queryFn: fetchInbox,
    refetchOnMount: 'always',
  });
}

export function useNotificationUnreadCount() {
  return useQuery({
    queryKey: queryKeys.notificationUnreadCount,
    queryFn: fetchUnreadCount,
  });
}

export function useRefreshNotificationInbox() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notificationInbox });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnreadCount });
  };
}
