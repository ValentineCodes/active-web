'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  NotificationInboxFilter,
  type InboxFilter,
} from '@/components/notifications/NotificationInboxFilter';
import {
  NotificationListItem,
  NotificationListItemSkeleton,
} from '@/components/notifications/NotificationListItem';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { TAB_BAR_HEIGHT } from '@/components/ui/tab-bar-insets';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import {
  markNotificationInboxItemRead,
  markNotificationInboxRead,
  useNotificationInbox,
  useNotificationUnreadCount,
  useRefreshNotificationInbox,
} from '@/features/notifications/inbox';
import {
  readPushBannerDismissed,
  setPushBannerDismissed,
} from '@/features/notifications/preferences';
import { useMyProfile } from '@/features/profile/api';
import { notificationNavigationPath } from '@/features/requests/activity-list';
import { queryKeys } from '@/lib/query/keys';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import type { InboxNotification } from '@/features/notifications/types';

type WebPushPermission = NotificationPermission | 'unsupported';

function readWebPushPermission(): WebPushPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function NotificationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useMyProfile();
  const inbox = useNotificationInbox();
  const refresh = useRefreshNotificationInbox();
  const unread = useNotificationUnreadCount();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [markingAll, setMarkingAll] = useState(false);
  const [permission, setPermission] = useState<WebPushPermission | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [enabling, setEnabling] = useState(false);

  const refreshPermissionState = useCallback(() => {
    setPermission(readWebPushPermission());
    void readPushBannerDismissed().then(setBannerDismissed);
  }, []);

  useEffect(() => {
    refreshPermissionState();
  }, [refreshPermissionState]);

  const unreadCount = unread.data ?? 0;
  const filteredItems = useMemo(() => {
    if (!inbox.data) return [];
    if (filter === 'unread') return inbox.data.filter((item) => item.readAt === null);
    return inbox.data;
  }, [filter, inbox.data]);

  const inboxSkeleton = showQuerySkeleton(inbox);
  const inboxEmpty = (inbox.isSuccess || inbox.isError) && filteredItems.length === 0;
  const paddingBottom = TAB_BAR_HEIGHT + 24;

  const pushPrefEnabled = profile.data?.push_notifications_enabled !== false;
  const osGranted = permission === 'granted';
  const pushActive = pushPrefEnabled && osGranted;
  const showPushBanner =
    pushPrefEnabled &&
    permission !== null &&
    permission !== 'unsupported' &&
    !osGranted &&
    !bannerDismissed;

  const unreadLabel =
    unreadCount === 0
      ? 'No new updates'
      : unreadCount === 1
        ? '1 unread update'
        : `${unreadCount} unread updates`;

  const markAllRead = () => {
    if (unreadCount === 0) return;
    setMarkingAll(true);
    void markNotificationInboxRead()
      .then(refresh)
      .finally(() => setMarkingAll(false));
  };

  const enablePush = async () => {
    if (permission === 'denied') {
      router.push('/notification-settings');
      return;
    }
    setEnabling(true);
    try {
      if ('Notification' in window) {
        await Notification.requestPermission();
      }
      refreshPermissionState();
    } finally {
      setEnabling(false);
    }
  };

  const dismissPushBanner = () => {
    void setPushBannerDismissed(true).then(() => setBannerDismissed(true));
  };

  const openNotification = (item: InboxNotification) => {
    if (
      item.type === 'withdrawal_submitted' ||
      item.type === 'withdrawal_processing' ||
      item.type === 'withdrawal_successful' ||
      item.type === 'withdrawal_failed'
    ) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
      void queryClient.invalidateQueries({ queryKey: queryKeys.walletActivity });
      void queryClient.invalidateQueries({ queryKey: queryKeys.walletWithdrawals });
    }

    if (item.readAt === null) {
      void markNotificationInboxItemRead(item.id).then(refresh);
    }

    const stored = item.url?.trim();
    if (stored && (stored === '/wallet' || stored.startsWith('/wallet/'))) {
      router.push(stored);
      return;
    }
    if (stored && /^\/(request|respond|engagement|conversation|rate)\//.test(stored)) {
      router.push(stored);
      return;
    }

    if (item.requestId) {
      router.push(
        notificationNavigationPath({
          requestId: item.requestId,
          type: item.type,
          metadata: item.metadata,
        }),
      );
      return;
    }

    if (
      item.type === 'withdrawal_submitted' ||
      item.type === 'withdrawal_processing' ||
      item.type === 'withdrawal_successful' ||
      item.type === 'withdrawal_failed' ||
      item.type === 'payment_received' ||
      item.type === 'payment_released' ||
      item.type === 'payment_secured' ||
      item.type === 'funds_returned'
    ) {
      router.push('/wallet');
    }
  };

  if (inbox.isError) {
    return (
      <Screen className="px-5 pt-4">
        <InlineError error={inbox.error} onRetry={refresh} />
      </Screen>
    );
  }

  return (
    <Screen className="h-full min-h-0 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-row items-center justify-between gap-3 px-5 pb-3 pt-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="text-2xl font-bold text-ink">Notifications</h1>
            {inboxSkeleton ? (
              <SkeletonBlock className="mt-1 h-3 w-28 rounded-md" />
            ) : (
              <p className="text-xs text-muted">{unreadLabel}</p>
            )}
          </div>
          <IconButton
            icon="settings-outline"
            variant="surface"
            size={34}
            accessibilityLabel="Notification settings"
            onClick={() => router.push('/notification-settings')}
          />
        </div>

        <div className="flex flex-row items-center justify-between gap-3 px-5 pb-2">
          <NotificationInboxFilter value={filter} onChange={setFilter} />
          {unreadCount > 0 ? (
            <button
              type="button"
              aria-label="Mark all notifications as read"
              disabled={markingAll}
              onClick={markAllRead}
              className="shrink-0 text-sm font-semibold text-active active:opacity-70 disabled:opacity-60"
            >
              {markingAll ? 'Updating…' : 'Mark all as read'}
            </button>
          ) : (
            <div className="w-28 shrink-0" aria-hidden />
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-1" style={{ paddingBottom }}>
          {inboxSkeleton ? (
            <InboxSkeletonList />
          ) : inbox.isSuccess || inbox.isError ? (
            <div className={inboxEmpty ? 'flex min-h-full flex-col justify-center' : 'flex flex-col'}>
              {inboxEmpty ? (
                <InboxEmptyState filter={filter} totalCount={inbox.data?.length ?? 0} />
              ) : (
                <div className="divide-y divide-hairline">
                  {filteredItems.map((item) => (
                    <NotificationListItem key={item.id} item={item} onPress={() => openNotification(item)} />
                  ))}
                </div>
              )}

              <InboxFooter
                showPushBanner={showPushBanner}
                enabling={enabling}
                permission={permission}
                onEnablePush={() => void enablePush()}
                onDismissBanner={dismissPushBanner}
                pushActive={pushActive}
                pushPrefEnabled={pushPrefEnabled}
                onOpenSettings={() => router.push('/notification-settings')}
              />
            </div>
          ) : null}
        </div>
      </div>
    </Screen>
  );
}

function InboxEmptyState({ filter, totalCount }: { filter: InboxFilter; totalCount: number }) {
  if (filter === 'unread' && totalCount > 0) {
    return (
      <EmptyState
        layout="list"
        icon="checkmark-circle-outline"
        title="You're all caught up"
        message="No unread notifications right now."
        messageClassName="text-center text-sm"
      />
    );
  }

  return (
    <EmptyState
      layout="list"
      icon="notifications-outline"
      title="Nothing yet"
      message="When something needs your attention, it will show up here."
      messageClassName="max-w-52 text-center text-sm"
    />
  );
}

function InboxFooter({
  showPushBanner,
  enabling,
  permission,
  onEnablePush,
  onDismissBanner,
  pushActive,
  pushPrefEnabled,
  onOpenSettings,
}: {
  showPushBanner: boolean;
  enabling: boolean;
  permission: WebPushPermission | null;
  onEnablePush: () => void;
  onDismissBanner: () => void;
  pushActive: boolean;
  pushPrefEnabled: boolean;
  onOpenSettings: () => void;
}) {
  if (showPushBanner) {
    return (
      <Card className="mt-6">
        <div className="flex flex-col gap-3">
          <p className="text-base font-semibold text-ink">Get alerts on your phone</p>
          <p className="text-xs leading-5 text-muted">
            Optional lock-screen alerts for new responses and urgent updates. This list always shows payment, dispute,
            and other important events.
          </p>
          {permission === 'denied' ? (
            <Button label="Open settings" variant="secondary" onClick={onOpenSettings} />
          ) : (
            <Button label="Enable push notifications" loading={enabling} onClick={onEnablePush} />
          )}
          <button
            type="button"
            onClick={onDismissBanner}
            className="self-center text-sm font-semibold text-muted active:opacity-70"
          >
            Not now
          </button>
        </div>
      </Card>
    );
  }

  if (!pushActive && pushPrefEnabled === false) {
    return (
      <Card className="mt-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Push alerts are off. You still receive all important updates here.</p>
          <button
            type="button"
            onClick={onOpenSettings}
            className="self-start text-sm font-semibold text-active active:opacity-80"
          >
            Manage in settings
          </button>
        </div>
      </Card>
    );
  }

  return null;
}

function InboxSkeletonList() {
  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index}>
          <NotificationListItemSkeleton />
          {index < 5 ? <div className="h-px bg-hairline" /> : null}
        </div>
      ))}
    </>
  );
}
