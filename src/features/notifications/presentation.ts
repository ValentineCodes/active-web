import { format, formatDistanceToNowStrict, isToday, isYesterday, subDays } from 'date-fns';
import type { Ionicons } from '@expo/vector-icons';

import type { InboxNotification, NotificationType } from '@/features/notifications/types';
import { NOTIFICATION_TYPES } from '@/features/notifications/types';
import { notificationNavigationPath } from '@/features/requests/activity-list';
import { getColors } from '@/theme';

const CANONICAL_TYPES = new Set<string>(NOTIFICATION_TYPES);

/** Relative time for notification rows (e.g. `2m`, `Yesterday`, `Mon`). */
export function formatInboxRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();

  if (isToday(date)) {
    const raw = formatDistanceToNowStrict(date, { addSuffix: false });
    if (raw === 'less than a minute') return 'now';

    const match = /^(\d+) (second|minute|hour)s?$/.exec(raw);
    if (!match) return raw;

    const value = match[1];
    switch (match[2]) {
      case 'second':
        return `${value}s`;
      case 'minute':
        return `${value}m`;
      case 'hour':
        return `${value}h`;
      default:
        return raw;
    }
  }

  if (isYesterday(date)) return 'Yesterday';

  if (date >= subDays(now, 6)) return format(date, 'EEE');

  return format(date, 'EEE');
}

type NotificationVisual = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBackground: string;
  useNairaSymbol?: boolean;
};

export function notificationVisual(type: NotificationType): NotificationVisual {
  const colors = getColors();
  const blue = {
    iconBackground: colors.notificationChipBlueBg,
    iconColor: colors.notificationChipBlueFg,
  };
  const purple = {
    iconBackground: colors.notificationChipPurpleBg,
    iconColor: colors.notificationChipPurpleFg,
  };
  const green = {
    iconBackground: colors.notificationChipGreenBg,
    iconColor: colors.notificationChipGreenFg,
  };
  const amber = {
    iconBackground: colors.notificationChipAmberBg,
    iconColor: colors.notificationChipAmberFg,
  };
  const red = {
    iconBackground: colors.notificationChipRedBg,
    iconColor: colors.notificationChipRedFg,
  };

  switch (type) {
    case 'response_received':
    case 'new_responses':
      return {
        icon: 'chatbubble-ellipses-outline',
        ...blue,
      };
    case 'request_expiring':
    case 'request_expired':
      return {
        icon: 'time-outline',
        ...amber,
      };
    case 'response_accepted':
      return {
        icon: 'checkmark-circle-outline',
        ...blue,
      };
    case 'response_not_selected':
      return {
        icon: 'close-circle-outline',
        ...blue,
      };
    case 'completion_requested':
      return {
        icon: 'checkmark',
        ...purple,
      };
    case 'payment_secured':
    case 'funds_returned':
    case 'payment_released':
    case 'payment_received':
    case 'withdrawal_processing':
    case 'withdrawal_successful':
    case 'withdrawal_failed':
    case 'funds_released_after_resolution':
      return {
        icon: 'wallet-outline',
        ...green,
        useNairaSymbol: true,
      };
    case 'new_message':
      return {
        icon: 'mail-outline',
        ...blue,
      };
    case 'missed_call':
      return {
        icon: 'call-outline',
        ...blue,
      };
    case 'request_cancelled':
    case 'helper_cancelled':
    case 'cancellation_confirmed':
      return {
        icon: 'checkmark',
        ...amber,
      };
    case 'problem_reported':
    case 'dispute_opened':
    case 'dispute_resolved':
      return {
        icon: 'alert',
        ...red,
      };
    case 'rate_experience':
      return {
        icon: 'star-outline',
        iconColor: colors.warning,
        iconBackground: colors.warningSoft,
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
