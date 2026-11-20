'use client';

import { useMutation } from '@tanstack/react-query';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { signOut } from '@/features/auth/api';
import { InlineError } from '@/components/ui/StateView';
import { SettingsGroup, SettingsRow } from '@/components/profile/SettingsRow';
import { ThemePreferenceSegment } from '@/components/settings/ThemePreferenceSegment';
import { useMyReputation } from '@/features/profile/reputation-api';
import { useMyEntitlements } from '@/features/projects/project-api';
import { useTheme } from '@/theme/ThemeProvider';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { LoadingState } from '@/components/ui/StateView';

export function SettingsPage() {
  const leave = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      window.location.href = '/welcome';
    },
  });
  const { preference, setPreference } = useTheme();
  const reputation = useMyReputation();
  const entitlements = useMyEntitlements();

  if (showQuerySkeleton(reputation) || showQuerySkeleton(entitlements)) {
    return (
      <FlowScreen title="Settings" backTo="/profile">
        <LoadingState />
      </FlowScreen>
    );
  }

  return (
    <FlowScreen title="Settings" backTo="/profile" bodyClassName="flex flex-col gap-6">
      <SettingsGroup title="Account">
        <SettingsRow label="Edit profile" to="/profile/edit" />
        <SettingsRow label="Reviews" to="/profile/reviews" showDivider />
        <SettingsRow label="Saved places" to="/profile/locations" showDivider />
        <SettingsRow label="Bank accounts" to="/profile/bank-accounts" showDivider />
      </SettingsGroup>

      <SettingsGroup title="Crown & conduct">
        <SettingsRow label="Crown visibility" to="/settings/privacy" />
      </SettingsGroup>

      <SettingsGroup title="Collaborative projects">
        <SettingsRow label="Premium & projects" to="/settings/premium" />
      </SettingsGroup>

      <SettingsGroup title="Notifications">
        <SettingsRow label="Push and in-app" to="/notification-settings" />
      </SettingsGroup>

      <SettingsGroup title="Preferences">
        <div className="flex flex-col gap-2 px-4 py-4">
          <p className="text-sm text-muted">Appearance</p>
          <ThemePreferenceSegment value={preference} onChange={setPreference} />
        </div>
      </SettingsGroup>

      <SettingsGroup title="Wallet">
        <SettingsRow label="Wallet" to="/wallet" />
      </SettingsGroup>

      <div className="flex flex-col gap-3 pt-2">
        {leave.isError ? <InlineError error={leave.error} /> : null}
        <button
          type="button"
          disabled={leave.isPending}
          onClick={() => leave.mutate()}
          className="py-3 text-center text-base font-semibold text-danger active:opacity-80 disabled:opacity-50"
        >
          {leave.isPending ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </FlowScreen>
  );
}