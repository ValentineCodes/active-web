import { formatDistanceToNowStrict } from 'date-fns';
import type { Ionicons } from '@expo/vector-icons';

import type { InboxNotification, NotificationType } from '@/features/notifications/types';
import { NOTIFICATION_TYPES } from '@/features/notifications/types';
import { colors } from '@/theme';

const CANONICAL_TYPES = new Set<string>(NOTIFICATION_TYPES);

export function isCanonicalInboxNotification(item: InboxNotification): boolean {
  return CANONICAL_TYPES.has(item.type);
}

/** Compact relative time for the notification list (e.g. `2m`, `1h`). */
export function formatInboxRelativeTime(iso: string): string {
  const raw = formatDistanceToNowStrict(new Date(iso), { addSuffix: false });
  if (raw === 'less than a minute') return 'now';

  const match = /^(\d+) (second|minute|hour|day|month|year)s?$/.exec(raw);
  if (!match) return raw;

  const value = match[1];
  switch (match[2]) {
    case 'second':
      return `${value}s`;
    case 'minute':
      return `${value}m`;
    case 'hour':
      return `${value}h`;
    case 'day':
      return `${value}d`;
    default:
      return raw;
  }
}

type NotificationVisual = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBackgroundClassName: string;
};

export function notificationVisual(type: NotificationType): NotificationVisual {
  switch (type) {
    case 'response_received':
    case 'new_responses':
      return {
        icon: 'chatbubble-ellipses-outline',
        iconColor: colors.brand,
        iconBackgroundClassName: 'bg-brandSoft',
      };
    case 'request_expiring':
    case 'request_expired':
      return {
        icon: 'time-outline',
        iconColor: colors.warning,
        iconBackgroundClassName: 'bg-warningSoft',
      };
    case 'response_accepted':
      return {
        icon: 'checkmark-circle-outline',
        iconColor: colors.active,
        iconBackgroundClassName: 'bg-activeSoft',
      };
    case 'response_not_selected':
      return {
        icon: 'close-circle-outline',
        iconColor: colors.muted,
        iconBackgroundClassName: 'bg-surface',
      };
    case 'completion_requested':
      return {
        icon: 'clipboard-outline',
        iconColor: colors.info,
        iconBackgroundClassName: 'bg-infoSoft',
      };
    case 'payment_secured':
    case 'funds_returned':
    case 'payment_released':
    case 'payment_received':
    case 'funds_released_after_resolution':
      return {
        icon: 'wallet-outline',
        iconColor: colors.brand,
        iconBackgroundClassName: 'bg-brandSoft',
      };
    case 'withdrawal_processing':
    case 'withdrawal_successful':
    case 'withdrawal_failed':
      return {
        icon: 'arrow-down-circle-outline',
        iconColor: colors.brand,
        iconBackgroundClassName: 'bg-brandSoft',
      };
    case 'new_message':
      return {
        icon: 'mail-outline',
        iconColor: colors.info,
        iconBackgroundClassName: 'bg-infoSoft',
      };
    case 'missed_call':
      return {
        icon: 'call-outline',
        iconColor: colors.danger,
        iconBackgroundClassName: 'bg-dangerSoft',
      };
    case 'request_cancelled':
    case 'helper_cancelled':
    case 'cancellation_confirmed':
      return {
        icon: 'ban-outline',
        iconColor: colors.muted,
        iconBackgroundClassName: 'bg-surface',
      };
    case 'problem_reported':
    case 'dispute_opened':
    case 'dispute_resolved':
      return {
        icon: 'alert-circle-outline',
        iconColor: colors.warning,
        iconBackgroundClassName: 'bg-warningSoft',
      };
    case 'rate_experience':
      return {
        icon: 'star-outline',
        iconColor: colors.warning,
        iconBackgroundClassName: 'bg-warningSoft',
      };
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/** Deep link target when opening a notification from the inbox. */
export function resolveNotificationHref(item: InboxNotification): string | null {
  if (item.url) return item.url;

  const requestId = item.requestId;
  if (!requestId) {
    if (
      item.type === 'withdrawal_processing' ||
      item.type === 'withdrawal_successful' ||
      item.type === 'withdrawal_failed' ||
      item.type === 'payment_received' ||
      item.type === 'payment_released' ||
      item.type === 'payment_secured' ||
      item.type === 'funds_returned'
    ) {
      return '/wallet';
    }
    return null;
  }

  switch (item.type) {
    case 'response_received':
    case 'new_responses':
    case 'request_expiring':
    case 'request_expired':
      return `/request/${requestId}`;
    case 'response_accepted':
      return `/engagement/${requestId}`;
    case 'response_not_selected':
      return `/respond/${requestId}`;
    case 'completion_requested':
    case 'helper_cancelled':
    case 'problem_reported':
    case 'dispute_opened':
    case 'dispute_resolved':
    case 'funds_released_after_resolution':
    case 'request_cancelled':
    case 'cancellation_confirmed':
      return `/engagement/${requestId}`;
    case 'payment_secured':
    case 'funds_returned':
    case 'payment_released':
    case 'payment_received':
      return '/wallet';
    case 'withdrawal_processing':
    case 'withdrawal_successful':
    case 'withdrawal_failed':
      return '/wallet';
    case 'new_message':
    case 'missed_call':
      return null;
    case 'rate_experience':
      return `/rate/${requestId}`;
    default: {
      const _exhaustive: never = item.type;
      return _exhaustive;
    }
  }
}
