import { format, formatDistanceToNowStrict, isToday, isYesterday, subDays } from 'date-fns';

import type { IonIconName } from '@/components/ui/ion-icons';
import type { NotificationType } from '@/features/notifications/types';

const CHIPS = {
  blue: { iconBackground: '#DBEAFE', iconColor: '#2563EB' },
  purple: { iconBackground: '#EDE9FE', iconColor: '#5B21B6' },
  green: { iconBackground: '#BBF7D0', iconColor: '#15803D' },
  amber: { iconBackground: '#FEF3C7', iconColor: '#B45309' },
  red: { iconBackground: '#FEE2E2', iconColor: '#DC2626' },
  warning: { iconBackground: '#FDF3E3', iconColor: '#B45309' },
} as const;

export function formatInboxRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();

  if (isToday(date)) {
    const raw = formatDistanceToNowStrict(date, { addSuffix: false });
    if (raw === 'less than a minute') return 'now';

    const match = /^(\d+) (second|minute|hour)s?$/.exec(raw);
    if (!match) return 'now';

    const value = Number(match[1]);
    switch (match[2]) {
      case 'second':
        return value <= 1 ? 'now' : `${value}s`;
      case 'minute':
        return `${value}m`;
      case 'hour':
        return `${value}h`;
      default:
        return 'now';
    }
  }

  if (isYesterday(date)) return 'Yesterday';
  if (date >= subDays(now, 6)) return format(date, 'EEE');
  return format(date, 'd MMM');
}

type NotificationVisual = {
  icon: IonIconName;
  iconColor: string;
  iconBackground: string;
  useNairaSymbol?: boolean;
};

export function notificationVisual(type: NotificationType): NotificationVisual {
  switch (type) {
    case 'response_received':
    case 'new_responses':
      return { icon: 'notifications-outline', ...CHIPS.blue };
    case 'matching_request':
      return { icon: 'location-outline', ...CHIPS.blue };
    case 'request_expiring':
    case 'request_awaiting_review':
    case 'request_expired':
      return { icon: 'notifications-outline', ...CHIPS.amber };
    case 'response_accepted':
    case 'response_not_selected':
      return { icon: 'checkmark-circle', ...CHIPS.blue };
    case 'completion_requested':
      return { icon: 'checkmark-circle', ...CHIPS.purple };
    case 'payment_secured':
    case 'funds_returned':
    case 'payment_released':
    case 'payment_received':
    case 'withdrawal_submitted':
    case 'withdrawal_processing':
    case 'withdrawal_successful':
    case 'withdrawal_failed':
    case 'funds_released_after_resolution':
      return { icon: 'notifications-outline', ...CHIPS.green, useNairaSymbol: true };
    case 'new_message':
    case 'missed_call':
      return { icon: 'notifications-outline', ...CHIPS.blue };
    case 'request_cancelled':
    case 'helper_cancelled':
    case 'cancellation_confirmed':
    case 'engagement_cancellation_requested':
    case 'engagement_cancellation_declined':
      return { icon: 'checkmark-circle', ...CHIPS.amber };
    case 'problem_reported':
    case 'dispute_opened':
    case 'dispute_resolved':
      return { icon: 'alert-circle', ...CHIPS.red };
    case 'rate_experience':
      return { icon: 'notifications-outline', ...CHIPS.warning };
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}
