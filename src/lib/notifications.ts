import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { useEffect } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { resolveNotificationHrefFromPushData } from '@/features/notifications/presentation';
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

export function useNotificationBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const refreshInbox = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationInbox });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnreadCount });
    };

    void syncPushToken({ mode: 'silent' });

    const received = Notifications.addNotificationReceivedListener(() => {
      refreshInbox();
      queryClient.invalidateQueries();
    });

    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      refreshInbox();
      queryClient.invalidateQueries();

      const data = response.notification.request.content.data;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const href = resolveNotificationHrefFromPushData(data as Record<string, unknown>);
        if (href) router.push(href as never);
      }
    });

    return () => {
      received.remove();
      tapped.remove();
    };
  }, [queryClient]);
}
