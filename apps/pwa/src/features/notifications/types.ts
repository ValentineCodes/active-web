import type { Database } from '@/lib/supabase/database.types';

export type NotificationType = Database['public']['Enums']['notification_type'];

export type InboxNotification = {
  id: string;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  url: string | null;
  requestId: string | null;
  responseId: string | null;
  paymentTransitionId: string | null;
  walletLedgerId: string | null;
  relatedUserId: string | null;
  metadata: Record<string, unknown> | null;
  receivedAt: string;
  readAt: string | null;
};
