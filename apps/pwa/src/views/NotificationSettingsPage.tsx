'use client';

import { useRouter } from 'next/navigation';

import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import {
  useUpdateNotificationPreferences,
  type NotificationPreferences,
} from '@/features/notifications/preferences';
import { useMyProfile } from '@/features/profile/api';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';

export function NotificationSettingsPage() {
  const router = useRouter();
  const profile = useMyProfile();
  const updatePrefs = useUpdateNotificationPreferences();

  if (showQuerySkeleton(profile)) {
    return (
      <Screen className="min-h-[100dvh]">
        <Header title="Notification settings" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (!profile.data) {
    return (
      <Screen className="min-h-[100dvh]">
        <Header title="Notification settings" onBack={() => router.back()} />
        <EmptyState
          icon="notifications-outline"
          title="Settings unavailable"
          message="Go back and open this screen again when you are online."
          action={{ label: 'Go back', onPress: () => router.back() }}
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

  const savePrefs = (patch: Partial<NotificationPreferences>) => {
    updatePrefs.mutate({ ...prefs, ...patch });
  };

  return (
    <Screen className="min-h-[100dvh]">
      <Header title="Notification settings" onBack={() => router.back()} />
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 pb-12 pt-2">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold leading-8 text-ink">Choose what reaches you</h2>
          <p className="text-sm leading-5 text-muted">
            Important account and dispute updates are always sent.
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl border border-hairline bg-elevated">
          <SettingsToggleRow
            label="Requests & responses"
            description="Offers, acceptances, and completion"
            checked={prefs.requestsResponsesEnabled}
            disabled={updatePrefs.isPending}
            onChange={(next) => savePrefs({ requestsResponsesEnabled: next })}
          />
          <SettingsToggleRow
            label="Messages"
            description="New messages from people you're helping"
            checked={prefs.messagesEnabled}
            disabled={updatePrefs.isPending}
            onChange={(next) => savePrefs({ messagesEnabled: next })}
            showDivider
          />
          <SettingsToggleRow
            label="Payments & wallet"
            description="Secured funds, payouts, and withdrawals"
            checked={prefs.paymentsWalletEnabled}
            disabled={updatePrefs.isPending}
            onChange={(next) => savePrefs({ paymentsWalletEnabled: next })}
            showDivider
          />
          <SettingsToggleRow
            label="Calls"
            description="Missed call alerts"
            checked={prefs.callsEnabled}
            disabled={updatePrefs.isPending}
            onChange={(next) => savePrefs({ callsEnabled: next })}
            showDivider
          />
          <SettingsToggleRow
            label="Tips & reminders"
            description="Helpful nudges from Active"
            checked={prefs.tipsRemindersEnabled}
            disabled={updatePrefs.isPending}
            onChange={(next) => savePrefs({ tipsRemindersEnabled: next })}
            showDivider
          />
        </div>

        {updatePrefs.isError ? <InlineError error={updatePrefs.error} /> : null}
      </div>
    </Screen>
  );
}

function SettingsToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
  showDivider,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  showDivider?: boolean;
}) {
  return (
    <>
      {showDivider ? <div className="mx-4 h-px bg-hairline" /> : null}
      <label className="flex flex-row items-center gap-3 px-4 py-4">
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-ink">{label}</span>
          <span className="block text-sm leading-5 text-muted">{description}</span>
        </span>
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-active"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    </>
  );
}
