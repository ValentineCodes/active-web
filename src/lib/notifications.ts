import { useEffect } from 'react';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

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

/**
 * Registers this device for push.
 *
 * `prompt` is only true at the two moments notifications start to matter — after
 * submitting a request, and after going Active — so the system dialog arrives with a
 * reason the person can see. On launch it is false, which refreshes the token for anyone
 * who already agreed and asks nobody who has not.
 */
export async function syncPushToken({ prompt }: { prompt: boolean }): Promise<void> {
  if (!Device.isDevice) return;

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;

  if (!granted) {
    if (!prompt || !existing.canAskAgain) return;
    granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  // Expo issues push tokens per EAS project. Until the project is linked there is no
  // token to fetch, and the app simply runs without push.
  if (typeof projectId !== 'string') return;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  await supabase
    .from('push_tokens')
    .upsert(
      { token, user_id: auth.user.id, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
      { onConflict: 'token' },
    );
}

/**
 * Keeps the app in step with what a notification says, whether or not it is tapped: an
 * arriving notification means server state the caches do not know about yet.
 */
export function useNotificationBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const refreshInbox = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationInbox });
    };

    syncPushToken({ prompt: false });

    const received = Notifications.addNotificationReceivedListener(() => {
      refreshInbox();
      queryClient.invalidateQueries();
    });

    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      refreshInbox();
      queryClient.invalidateQueries();

      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string') router.push(url as never);
    });

    return () => {
      received.remove();
      tapped.remove();
    };
  }, [queryClient]);
}
