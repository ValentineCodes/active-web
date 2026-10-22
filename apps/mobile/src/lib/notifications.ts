import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { useCallback, useEffect, useRef } from 'react';
import { router, useRootNavigationState } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { NotificationResponse } from 'expo-notifications';

import { resolveNotificationHrefFromPushDataForOpen } from '@/features/notifications/presentation';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushPermissionState = {
  granted: boolean;
  canAskAgain: boolean;
  status: Notifications.PermissionStatus;
};

export async function readPushPermission(): Promise<PushPermissionState> {
  const result = await Notifications.getPermissionsAsync();
  return {
    granted: result.granted,
    canAskAgain: result.canAskAgain,
    status: result.status,
  };
}

export function openNotificationSettings(): void {
  void Linking.openSettings();
}

type SyncPushMode = 'silent' | 'contextual' | 'user';

/**
 * Registers this device for push when OS permission and user prefs allow.
 *
 * - `silent`: refresh token only if already granted (tabs mount, settings after allow).
 * - `contextual`: may show the system dialog once at a meaningful moment (post request, respond).
 * - `user`: explicit opt-in from notification settings or the notifications tab.
 */
export async function syncPushToken({
  mode,
}: {
  mode: SyncPushMode;
}): Promise<'registered' | 'skipped' | 'denied'> {
  if (!Device.isDevice) return 'skipped';

  const existing = await readPushPermission();
  let granted = existing.granted;

  if (!granted) {
    if (mode === 'silent') return 'skipped';
    if (existing.canAskAgain === false) return 'denied';

    const shouldPrompt =
      mode === 'user' ||
      (mode === 'contextual' && existing.status === Notifications.PermissionStatus.UNDETERMINED);

    if (!shouldPrompt) return 'skipped';

    granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return 'denied';
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== 'string') return 'skipped';

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return 'skipped';

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'push_notifications_enabled, message_push_enabled, push_payments_wallet_enabled, push_calls_enabled, push_tips_reminders_enabled',
    )
    .eq('id', auth.user.id)
    .single();

  const pushEnabled =
    profile?.push_notifications_enabled !== false ||
    profile?.message_push_enabled !== false ||
    profile?.push_payments_wallet_enabled !== false ||
    profile?.push_calls_enabled !== false ||
    profile?.push_tips_reminders_enabled !== false;

  if (!pushEnabled) return 'skipped';

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  await supabase.from('push_tokens').upsert(
    {
      token,
      user_id: auth.user.id,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'token' },
  );

  return 'registered';
}

function notificationResponseKey(response: NotificationResponse): string {
  return `${response.notification.request.identifier}:${response.actionIdentifier}`;
}

export function useNotificationBridge() {
  const queryClient = useQueryClient();
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const pendingHrefRef = useRef<string | null>(null);
  const handledResponseKeyRef = useRef<string | null>(null);

  const refreshInbox = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notificationInbox });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnreadCount });
  }, [queryClient]);

  const refreshWalletAfterWithdrawalAlert = useCallback(
    (data: Record<string, unknown>) => {
      const type = data.type;
      if (typeof type !== 'string') return;
      if (
        type !== 'withdrawal_submitted' &&
        type !== 'withdrawal_processing' &&
        type !== 'withdrawal_successful' &&
        type !== 'withdrawal_failed'
      ) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
      void queryClient.invalidateQueries({ queryKey: queryKeys.walletActivity });
      void queryClient.invalidateQueries({ queryKey: queryKeys.walletWithdrawals });
    },
    [queryClient],
  );

  const navigateFromNotification = useCallback(
    (href: string) => {
      if (!navigationReady) {
        pendingHrefRef.current = href;
        return;
      }
      router.push(href as never);
    },
    [navigationReady],
  );

  const openNotificationResponse = useCallback(
    (response: NotificationResponse) => {
      const responseKey = notificationResponseKey(response);
      if (handledResponseKeyRef.current === responseKey) return;
      handledResponseKeyRef.current = responseKey;

      refreshInbox();

      const data = response.notification.request.content.data;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        refreshWalletAfterWithdrawalAlert(data as Record<string, unknown>);
        void resolveNotificationHrefFromPushDataForOpen(
          queryClient,
          data as Record<string, unknown>,
        ).then((href) => {
          if (href) navigateFromNotification(href);
        });
      }
    },
    [navigateFromNotification, queryClient, refreshInbox, refreshWalletAfterWithdrawalAlert],
  );

  useEffect(() => {
    if (!navigationReady || !pendingHrefRef.current) return;
    const href = pendingHrefRef.current;
    pendingHrefRef.current = null;
    router.push(href as never);
  }, [navigationReady]);

  useEffect(() => {
    void syncPushToken({ mode: 'silent' });

    const received = Notifications.addNotificationReceivedListener((event) => {
      refreshInbox();
      const data = event.request.content.data;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        refreshWalletAfterWithdrawalAlert(data as Record<string, unknown>);
      }
    });

    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      openNotificationResponse(response);
    });

    return () => {
      received.remove();
      tapped.remove();
    };
  }, [openNotificationResponse, refreshInbox, refreshWalletAfterWithdrawalAlert]);
}
