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
};

async function fetchInbox(): Promise<InboxNotification[]> {
  const { data, error } = await supabase
    .from('notification_inbox')
    .select('id, title, body, url, created_at')
    .order('created_at', { ascending: false })
    .limit(INBOX_LIMIT);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    url: row.url,
    receivedAt: row.created_at,
  }));
}

export function useNotificationInbox() {
  return useQuery({
    queryKey: queryKeys.notificationInbox,
    queryFn: fetchInbox,
    refetchOnMount: 'always',
  });
}

export function useRefreshNotificationInbox() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.notificationInbox });
}
