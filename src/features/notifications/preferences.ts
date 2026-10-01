import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export type NotificationPreferences = {
  pushNotificationsEnabled: boolean;
  messagePushEnabled: boolean;
};

const PUSH_BANNER_DISMISSED_KEY = '@active/push_banner_dismissed';

export async function readPushBannerDismissed(): Promise<boolean> {
  return (await AsyncStorage.getItem(PUSH_BANNER_DISMISSED_KEY)) === '1';
}

export async function setPushBannerDismissed(dismissed: boolean): Promise<void> {
  if (dismissed) await AsyncStorage.setItem(PUSH_BANNER_DISMISSED_KEY, '1');
  else await AsyncStorage.removeItem(PUSH_BANNER_DISMISSED_KEY);
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (prefs: NotificationPreferences) => {
      const { error } = await supabase.rpc('set_notification_preferences', {
        p_push_notifications_enabled: prefs.pushNotificationsEnabled,
        p_message_push_enabled: prefs.messagePushEnabled,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });
}
