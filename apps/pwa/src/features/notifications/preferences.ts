'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase/client';

const PUSH_BANNER_DISMISSED_KEY = 'active/push_banner_dismissed';

export async function readPushBannerDismissed(): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(PUSH_BANNER_DISMISSED_KEY) === '1';
}

export async function setPushBannerDismissed(dismissed: boolean): Promise<void> {
  if (typeof window === 'undefined') return;
  if (dismissed) window.localStorage.setItem(PUSH_BANNER_DISMISSED_KEY, '1');
  else window.localStorage.removeItem(PUSH_BANNER_DISMISSED_KEY);
}

export type NotificationPreferences = {
  requestsResponsesEnabled: boolean;
  messagesEnabled: boolean;
  paymentsWalletEnabled: boolean;
  callsEnabled: boolean;
  tipsRemindersEnabled: boolean;
};

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (prefs: NotificationPreferences) => {
      const { error } = await supabase.rpc('set_notification_preferences', {
        p_push_notifications_enabled: prefs.requestsResponsesEnabled,
        p_message_push_enabled: prefs.messagesEnabled,
        p_push_payments_wallet_enabled: prefs.paymentsWalletEnabled,
        p_push_calls_enabled: prefs.callsEnabled,
        p_push_tips_reminders_enabled: prefs.tipsRemindersEnabled,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
