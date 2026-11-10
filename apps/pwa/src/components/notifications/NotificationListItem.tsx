import { MARKET } from '@/config/index';
import { IonIcon } from '@/components/ui/IonIcon';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { ionIcons } from '@/components/ui/ion-icons';
import { formatInboxRelativeTime, notificationVisual } from '@/features/notifications/presentation';
import type { InboxNotification } from '@/features/notifications/types';
import { cn } from '@/lib/cn';
import { formatNotificationCopy } from '@/lib/format';

export function NotificationListItem({
  item,
  onPress,
}: {
  item: InboxNotification;
  onPress: () => void;
}) {
  const unread = item.readAt === null;
  const visual = notificationVisual(item.type);
  const title = formatNotificationCopy(item.title);
  const body = item.body ? formatNotificationCopy(item.body) : null;

  return (
    <button
      type="button"
      onClick={onPress}
      className="flex w-full flex-row gap-3 py-4 text-left active:opacity-80"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: visual.iconBackground }}
      >
        {visual.useNairaSymbol ? (
          <span className="text-base font-bold" style={{ color: visual.iconColor }}>
            {MARKET.currencySymbol}
          </span>
        ) : (
          <IonIcon icon={ionIcons[visual.icon]} size={22} color={visual.iconColor} />
        )}
      </span>

      <span className="min-w-0 flex-1 pr-2">
        <span className={cn('block text-sm text-ink', unread ? 'font-bold' : 'font-semibold')}>{title}</span>
        {body ? <span className="mt-1 block line-clamp-2 text-sm leading-5 text-muted">{body}</span> : null}
      </span>

      <span className="flex shrink-0 flex-row items-center gap-1.5 self-start pl-1 pt-0.5">
        <span className="text-xs text-subtle">{formatInboxRelativeTime(item.receivedAt)}</span>
        {unread ? <span className="h-2 w-2 rounded-full bg-active" aria-hidden /> : null}
      </span>
    </button>
  );
}

export function NotificationListItemSkeleton() {
  return (
    <SkelRow />
  );
}

function SkelRow() {
  return (
    <div className="flex flex-row gap-3 py-4" aria-hidden>
      <SkeletonBlock className="h-11 w-11 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pr-2">
        <SkeletonBlock className="h-4 w-4/5 rounded-md" />
        <SkeletonBlock className="h-10 w-full rounded-md" />
      </div>
      <SkeletonBlock className="h-3 w-10 rounded-md" />
    </div>
  );
}
