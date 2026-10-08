import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { NotificationTagInterestPicker } from '@/components/notifications/NotificationTagInterestPicker';
import {
  useUpdateNotificationPreferences,
  setPushBannerDismissed,
  type NotificationPreferences,
} from '@/features/notifications/preferences';
import {
  useNotificationTagInterests,
  useUpdateNotificationTagInterests,
} from '@/features/notifications/tag-interests';
import type { RequestTag } from '@/features/requests/tags';
import { useProfile } from '@/features/profile/api';
import {
  openNotificationSettings,
  readPushPermission,
  syncPushToken,
  type PushPermissionState,
} from '@/lib/notifications';
import { useColors } from '@/theme';

function SettingsToggleRow({
  label,
  description,
  value,
  disabled,
  onValueChange,
  showDivider,
}: {
  label: string;
  description: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (next: boolean) => void;
  showDivider?: boolean;
}) {
  const colors = useColors();
  return (
    <>
      {showDivider ? <View className="mx-4 h-px bg-hairline" /> : null}
      <View className="flex-row items-center gap-3 px-4 py-4">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-lg font-semibold text-ink">{label}</Text>
          <Text className="text-sm leading-5 text-muted">{description}</Text>
        </View>
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={onValueChange}
          trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
          thumbColor={colors.switchThumb}
          ios_backgroundColor={colors.switchTrackOff}
        />
      </View>
    </>
  );
}

export default function NotificationSettingsScreen() {
  const profile = useProfile();
  const updatePrefs = useUpdateNotificationPreferences();
  const tagInterests = useNotificationTagInterests();
  const updateTagInterests = useUpdateNotificationTagInterests();
  const [permission, setPermission] = useState<PushPermissionState | null>(null);

  const refreshPermission = useCallback(() => {
    void readPushPermission().then(setPermission);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshPermission();
    }, [refreshPermission]),
  );

  if (profile.isPending || tagInterests.isPending) {
    return (
      <Screen>
        <Header title="Notification settings" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (profile.isError || tagInterests.isError) {
    return (
      <Screen>
        <Header title="Notification settings" onBack={() => router.back()} />
        <ErrorState
          error={profile.error ?? tagInterests.error}
          onRetry={() => {
            void profile.refetch();
            void tagInterests.refetch();
          }}
        />
      </Screen>
    );
  }

  const prefs: NotificationPreferences = {
    requestsResponsesEnabled: profile.data.push_notifications_enabled,
    messagesEnabled: profile.data.message_push_enabled,
    paymentsWalletEnabled: profile.data.push_payments_wallet_enabled,
    callsEnabled: profile.data.push_calls_enabled,
    tipsRemindersEnabled: profile.data.push_tips_reminders_enabled,
  };

  const osGranted = permission?.granted ?? false;
  const osBlocked = permission !== null && !permission.granted && permission.canAskAgain === false;
  const anyPushEnabled =
    prefs.requestsResponsesEnabled ||
    prefs.messagesEnabled ||
    prefs.paymentsWalletEnabled ||
    prefs.callsEnabled ||
    prefs.tipsRemindersEnabled;

  const saveTagInterests = (next: RequestTag[]) => {
    updateTagInterests.mutate(next);
  };

  const savePrefs = (patch: Partial<NotificationPreferences>) => {
    const next = { ...prefs, ...patch };
    updatePrefs.mutate(next, {
      onSuccess: async () => {
        if (
          next.requestsResponsesEnabled ||
          next.messagesEnabled ||
          next.paymentsWalletEnabled ||
          next.callsEnabled ||
          next.tipsRemindersEnabled
        ) {
          const result = await syncPushToken({ mode: 'user' });
          refreshPermission();
          if (result === 'registered') {
            await setPushBannerDismissed(false);
          }
        }
      },
    });
  };

  return (
    <Screen>
      <Header title="Notification settings" onBack={() => router.back()} />

      <ScrollView contentContainerClassName="gap-6 px-5 pb-12 pt-2">
        <View className="gap-2">
          <Text className="text-3xl font-bold leading-9 text-ink">Choose what reaches you</Text>
          <Text className="text-base leading-6 text-muted">
            Important account and dispute updates are always sent.
          </Text>
        </View>

        <View className="overflow-hidden rounded-3xl border border-hairline bg-elevated">
          <SettingsToggleRow
            label="Requests & responses"
            description="Offers, acceptances, cancellations, and completion"
            value={prefs.requestsResponsesEnabled}
            disabled={updatePrefs.isPending}
            onValueChange={(next) => savePrefs({ requestsResponsesEnabled: next })}
          />
          <SettingsToggleRow
            label="Messages"
            description="New messages from people you're helping"
            value={prefs.messagesEnabled}
            disabled={updatePrefs.isPending}
            onValueChange={(next) => savePrefs({ messagesEnabled: next })}
            showDivider
          />
          <SettingsToggleRow
            label="Payments & wallet"
            description="Secured funds, payouts, and withdrawals"
            value={prefs.paymentsWalletEnabled}
            disabled={updatePrefs.isPending}
            onValueChange={(next) => savePrefs({ paymentsWalletEnabled: next })}
            showDivider
          />
          <SettingsToggleRow
            label="Calls"
            description="Missed call alerts"
            value={prefs.callsEnabled}
            disabled={updatePrefs.isPending}
            onValueChange={(next) => savePrefs({ callsEnabled: next })}
            showDivider
          />
          <SettingsToggleRow
            label="Tips & reminders"
            description="Helpful nudges from Active"
            value={prefs.tipsRemindersEnabled}
            disabled={updatePrefs.isPending}
            onValueChange={(next) => savePrefs({ tipsRemindersEnabled: next })}
            showDivider
          />
        </View>

        {updatePrefs.isError ? <InlineError error={updatePrefs.error} /> : null}

        <View className="gap-2">
          <Text className="text-lg font-bold text-ink">Request interests</Text>
          <Text className="text-base leading-6 text-muted">
            Choose the types of requests you&apos;d like to hear about.
          </Text>
        </View>

        <View className="overflow-hidden rounded-3xl border border-hairline bg-elevated">
          <NotificationTagInterestPicker
            selected={tagInterests.data ?? []}
            onChange={saveTagInterests}
            disabled={updateTagInterests.isPending}
          />
        </View>

        <Text className="text-sm leading-5 text-muted">
          Alerts use the same tag list as requests. Leave this empty to skip interest-based request
          alerts. Responding on the app is not limited by these choices.
        </Text>

        {updateTagInterests.isError ? <InlineError error={updateTagInterests.error} /> : null}

        {anyPushEnabled && !osGranted ? (
          <View className="gap-3 rounded-2xl border border-hairline bg-surface p-4">
            <Text className="text-base font-semibold text-ink">Allow alerts on this device</Text>
            <Text className="text-sm leading-5 text-muted">
              {osBlocked
                ? 'Notifications are blocked in your phone settings. You can still use the in-app notification center.'
                : 'Turn on notifications for Active in the system prompt, or try again below.'}
            </Text>
            {osBlocked ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => openNotificationSettings()}
                className="self-start active:opacity-80"
              >
                <Text className="text-base font-semibold text-active">Open Settings</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void syncPushToken({ mode: 'user' }).then(() => refreshPermission());
                }}
                className="self-start active:opacity-80"
              >
                <Text className="text-base font-semibold text-active">Allow notifications</Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
