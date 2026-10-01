import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import {
  useUpdateNotificationPreferences,
  setPushBannerDismissed,
} from '@/features/notifications/preferences';
import { useProfile } from '@/features/profile/api';
import {
  openNotificationSettings,
  readPushPermission,
  syncPushToken,
  type PushPermissionState,
} from '@/lib/notifications';
import { colors } from '@/theme';

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
  return (
    <>
      {showDivider ? <View className="mx-4 h-px bg-hairline" /> : null}
      <View className="flex-row items-center gap-3 px-4 py-4">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-lg text-ink">{label}</Text>
          <Text className="text-sm leading-5 text-muted">{description}</Text>
        </View>
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={onValueChange}
          trackColor={{ false: colors.hairline, true: colors.activeSoft }}
          thumbColor={value ? colors.active : colors.canvas}
          ios_backgroundColor={colors.hairline}
        />
      </View>
    </>
  );
}

export default function NotificationSettingsScreen() {
  const profile = useProfile();
  const updatePrefs = useUpdateNotificationPreferences();
  const [permission, setPermission] = useState<PushPermissionState | null>(null);

  const refreshPermission = useCallback(() => {
    void readPushPermission().then(setPermission);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshPermission();
    }, [refreshPermission]),
  );

  if (profile.isPending) {
    return (
      <Screen>
        <Header title="Notifications" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (profile.isError) {
    return (
      <Screen>
        <Header title="Notifications" onBack={() => router.back()} />
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      </Screen>
    );
  }

  const pushEnabled = profile.data.push_notifications_enabled;
  const messageEnabled = profile.data.message_push_enabled;
  const osGranted = permission?.granted ?? false;
  const osBlocked = permission !== null && !permission.granted && permission.canAskAgain === false;

  const setPushEnabled = (next: boolean) => {
    updatePrefs.mutate(
      {
        pushNotificationsEnabled: next,
        messagePushEnabled: messageEnabled,
      },
      {
        onSuccess: async () => {
          if (next) {
            const result = await syncPushToken({ mode: 'user' });
            refreshPermission();
            if (result === 'registered') {
              await setPushBannerDismissed(false);
            }
          }
        },
      },
    );
  };

  const setMessageEnabled = (next: boolean) => {
    updatePrefs.mutate({
      pushNotificationsEnabled: pushEnabled,
      messagePushEnabled: next,
    });
  };

  return (
    <Screen>
      <Header title="Notifications" onBack={() => router.back()} />

      <ScrollView contentContainerClassName="gap-6 p-5 pb-12">
        <Text className="text-base leading-6 text-muted">
          Your notification center always lists important updates — responses, payments, disputes,
          and more — even when phone alerts are off.
        </Text>

        <View className="overflow-hidden rounded-2xl border border-hairline bg-elevated">
          <SettingsToggleRow
            label="Push notifications"
            description="Alerts on your lock screen for time-sensitive updates."
            value={pushEnabled}
            disabled={updatePrefs.isPending}
            onValueChange={setPushEnabled}
          />
          <SettingsToggleRow
            label="Messages and calls"
            description="Push for new messages and missed calls when messaging is available."
            value={messageEnabled && pushEnabled}
            disabled={updatePrefs.isPending || !pushEnabled}
            onValueChange={setMessageEnabled}
            showDivider
          />
        </View>

        {updatePrefs.isError ? <InlineError error={updatePrefs.error} /> : null}

        {pushEnabled && !osGranted ? (
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
                <Text className="text-base font-semibold text-brand">Open Settings</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void syncPushToken({ mode: 'user' }).then(() => refreshPermission());
                }}
                className="self-start active:opacity-80"
              >
                <Text className="text-base font-semibold text-brand">Allow notifications</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/notifications')}
          className="active:opacity-80"
        >
          <Text className="text-base font-semibold text-brand">Open notification center</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
