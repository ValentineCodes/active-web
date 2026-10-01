import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { InboxNotification } from '@/features/notifications/types';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export type { InboxNotification, NotificationType } from '@/features/notifications/types';

const INBOX_LIMIT = 50;

async function fetchInbox(): Promise<InboxNotification[]> {
  const { data, error } = await supabase
    .from('notification_inbox')
    .select(
      'id, user_id, type, title, body, url, request_id, response_id, payment_transition_id, wallet_ledger_id, related_user_id, metadata, created_at, read_at',
    )
    .order('created_at', { ascending: false })
    .limit(INBOX_LIMIT);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    recipientUserId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    url: row.url,
    requestId: row.request_id,
    responseId: row.response_id,
    paymentTransitionId: row.payment_transition_id,
    walletLedgerId: row.wallet_ledger_id,
    relatedUserId: row.related_user_id,
    metadata: row.metadata as Record<string, unknown> | null,
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

export async function markRequestResponseNotificationsRead(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_request_response_notifications_read', {
    p_request_id: requestId,
  });
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
