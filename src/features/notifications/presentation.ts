import { formatDistanceToNowStrict } from 'date-fns';
import type { Ionicons } from '@expo/vector-icons';

import type { InboxNotification, NotificationType } from '@/features/notifications/types';
import { NOTIFICATION_TYPES } from '@/features/notifications/types';
import { notificationNavigationPath } from '@/features/requests/activity-list';
import { getColors } from '@/theme';

const CANONICAL_TYPES = new Set<string>(NOTIFICATION_TYPES);

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
  const colors = getColors();
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

export type NotificationNavigationInput = Pick<
  InboxNotification,
  'type' | 'requestId' | 'metadata'
>;

/** Deep link target when opening a notification (inbox row or push payload). */
export function resolveNotificationHref(item: NotificationNavigationInput): string | null {
  if (item.requestId) {
    return notificationNavigationPath({
      requestId: item.requestId,
      type: item.type,
      metadata: item.metadata,
    });
  }

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

export function resolveNotificationHrefFromPushData(data: Record<string, unknown>): string | null {
  const type = data.type;
  if (typeof type !== 'string' || !CANONICAL_TYPES.has(type)) {
    return null;
  }

  const metadata =
    data.metadata !== null && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : null;

  return resolveNotificationHref({
    type: type as NotificationType,
    requestId: parsePushRequestId(data.request_id),
    metadata,
  });
}

function parsePushRequestId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}
