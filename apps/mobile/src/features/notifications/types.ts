import type { Database } from '@/lib/supabase/database.types';

/** Canonical persistent notification types stored on `notification_inbox.type`. */
export type NotificationType = Database['public']['Enums']['notification_type'];

export type NotificationInboxRow = Database['public']['Tables']['notification_inbox']['Row'];

/** Recipient of the notification (`notification_inbox.user_id`). */
export type NotificationRecipientUserId = NotificationInboxRow['user_id'];

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

export const NOTIFICATION_TYPES = [
  'response_received',
  'new_responses',
  'matching_request',
  'request_expiring',
  'request_awaiting_review',
  'request_expired',
  'response_accepted',
  'response_not_selected',
  'completion_requested',
  'payment_secured',
  'funds_returned',
  'payment_released',
  'payment_received',
  'withdrawal_processing',
  'withdrawal_successful',
  'withdrawal_failed',
  'new_message',
  'missed_call',
  'request_cancelled',
  'helper_cancelled',
  'cancellation_confirmed',
  'engagement_cancellation_requested',
  'engagement_cancellation_declined',
  'problem_reported',
  'dispute_opened',
  'dispute_resolved',
  'funds_released_after_resolution',
  'rate_experience',
] as const satisfies readonly NotificationType[];
