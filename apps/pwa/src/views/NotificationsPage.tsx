'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import {
  NotificationInboxFilter,
  type InboxFilter,
} from '@/components/notifications/NotificationInboxFilter';
import {
  NotificationListItem,
  NotificationListItemSkeleton,
} from '@/components/notifications/NotificationListItem';
import { Screen } from '@/components/ui/Screen';
import { TAB_BAR_HEIGHT } from '@/components/ui/tab-bar-insets';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { Button } from '@/components/ui/Button';
import {
  markNotificationInboxItemRead,
  markNotificationInboxRead,
  useNotificationInbox,
  useNotificationUnreadCount,
  useRefreshNotificationInbox,
} from '@/features/notifications/inbox';
import { notificationNavigationPath } from '@/features/requests/activity-list';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';

export function NotificationsPage() {
  const router = useRouter();
  const inbox = useNotificationInbox();
  const refresh = useRefreshNotificationInbox();
  const unread = useNotificationUnreadCount();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [markingAll, setMarkingAll] = useState(false);

  const rows = useMemo(() => {
    const items = inbox.data ?? [];
    if (filter === 'unread') return items.filter((item) => item.readAt === null);
    return items;
  }, [filter, inbox.data]);

  const skeleton = showQuerySkeleton(inbox);
  const paddingBottom = TAB_BAR_HEIGHT + 24;

  if (inbox.isError) {
    return (
      <Screen className="px-5 pt-4">
        <InlineError error={inbox.error} onRetry={refresh} />
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="flex min-h-0 flex-1 flex-col" style={{ paddingBottom }}>
        <div className="flex flex-row items-start justify-between gap-3 px-5 pb-2 pt-3">
          <h1 className="text-2xl font-bold text-ink">Notifications</h1>
          {unread.data && unread.data > 0 ? (
            <Button
              label={markingAll ? '…' : 'Mark all read'}
              variant="ghost"
              className="!w-auto shrink-0"
              disabled={markingAll}
              onClick={() => {
                setMarkingAll(true);
                void markNotificationInboxRead()
                  .then(refresh)
                  .finally(() => setMarkingAll(false));
              }}
            />
          ) : null}
        </div>

        <div className="px-5 pb-3">
          <NotificationInboxFilter value={filter} onChange={setFilter} />
        </div>

        <InboxListBody skeleton={skeleton} rows={rows} refresh={refresh} router={router} />
      </div>
    </Screen>
  );
}

function InboxListBody({
  skeleton,
  rows,
  refresh,
  router,
}: {
  skeleton: boolean;
  rows: NonNullable<ReturnType<typeof useNotificationInbox>['data']>;
  refresh: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  if (skeleton) {
    return (
      <InboxSkeletonList />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        layout="list"
        icon="notifications-outline"
        title="No notifications"
        message="When something happens on your requests or wallet, it will show up here."
      />
    );
  }

  return (
    <div className="flex-1 divide-y divide-hairline overflow-y-auto px-5">
      {rows.map((item) => (
        <NotificationListItem
          key={item.id}
          item={item}
          onPress={() => {
            if (!item.readAt) void markNotificationInboxItemRead(item.id).then(refresh);
            if (!item.requestId) return;
            const href = notificationNavigationPath({
              requestId: item.requestId,
              type: item.type,
              metadata: item.metadata,
            });
            router.push(href);
          }}
        />
      ))}
    </div>
  );
}

function InboxSkeletonList() {
  return (
    <div className="flex-1 px-5">
      {Array.from({ length: 6 }, (_, index) => (
        <NotificationListItemSkeleton key={index} />
      ))}
    </div>
  );
}
