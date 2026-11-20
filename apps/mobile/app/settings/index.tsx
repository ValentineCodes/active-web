import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { type Href, router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';

import { SettingsGroup, SettingsRow } from '@/components/settings/SettingsRows';
import { ReportIssueModal } from '@/components/ReportIssueModal';
import { ThemePreferenceSegment } from '@/components/settings/ThemePreferenceSegment';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { SettingsMenuSkeleton } from '@/components/ui/content-skeletons';
import { InlineError } from '@/components/ui/StateView';
import { signOut } from '@/features/auth/api';
import { useMyIdentityStatus } from '@/features/identity/api';
import { useProfile } from '@/features/profile/api';
import { useMyEntitlements } from '@/features/projects/project-api';
import { useMyReputation } from '@/features/profile/reputation-api';
import { useMyWallet } from '@/features/wallet/api';
import { APP_REPORT_ISSUES } from '@/features/support/report-issue-options';
import { usePullToRefresh } from '@/lib/query/use-pull-to-refresh';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { formatMoney } from '@/lib/format';
import { showAppToast } from '@/lib/toast';
import { useTheme } from '@/theme';

export default function SettingsScreen() {
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const profile = useProfile();
  const identityStatus = useMyIdentityStatus();
  const wallet = useMyWallet();
  const entitlements = useMyEntitlements();
  const reputation = useMyReputation();
  const leave = useMutation({ mutationFn: signOut });
  const { preference, setPreference } = useTheme();

  const onPullRefresh = useCallback(
    () => Promise.all([profile.refetch(), wallet.refetch(), identityStatus.refetch()]),
    [identityStatus, profile, wallet],
  );
  const { refreshing, onRefresh } = usePullToRefresh(onPullRefresh);

  if (showQuerySkeleton(profile)) {
    return (
      <Screen>
        <Header title="Settings" onBack={() => router.back()} />
        <SettingsMenuSkeleton />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Settings" onBack={() => router.back()} />
      <ScrollView
        contentContainerClassName="gap-6 px-5 pb-12 pt-2"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <SettingsGroup title="Account">
          <SettingsRow label="Edit profile" onPress={() => router.push('/profile/edit')} />
          <SettingsRow
            label="Reviews"
            onPress={() => router.push('/profile/reviews' as Href)}
            showDivider
          />
          <SettingsRow
            label="Saved places"
            onPress={() => router.push('/profile/locations' as Href)}
            showDivider
          />
          <SettingsRow
            label="Bank accounts"
            onPress={() => router.push('/profile/bank-accounts' as Href)}
            showDivider
          />
        </SettingsGroup>

        <SettingsGroup title="Crown & conduct">
          <SettingsRow
            label="Crown & conduct"
            description={
              reputation.data
                ? `${reputation.data.points_main} pts · ${reputation.data.crown_tier}`
                : 'Reputation across Active'
            }
            onPress={() => router.push('/settings/reputation' as Href)}
          />
          <SettingsRow
            label="Crown visibility"
            description={
              reputation.data?.crown_public ?? true
                ? 'Visible on public profile'
                : 'Hidden on public profile'
            }
            onPress={() => router.push('/settings/privacy' as Href)}
            showDivider
          />
        </SettingsGroup>

        <SettingsGroup title="Collaborative projects">
          <SettingsRow
            label="Premium & projects"
            description={
              entitlements.data?.premium_active
                ? 'Premium trial active'
                : entitlements.data?.premium_trial_started_at
                  ? 'Trial ended — existing projects remain available'
                  : 'Start a free 30-day trial (no card)'
            }
            onPress={() => router.push('/settings/premium' as Href)}
          />
        </SettingsGroup>

        <SettingsGroup title="Notifications">
          <SettingsRow
            label="Push and in-app notifications"
            onPress={() => router.push('/notification-settings')}
          />
        </SettingsGroup>

        <SettingsGroup title="Security">
          <SettingsRow
            label="Identity verification"
            description={
              identityStatus.data?.identityVerified
                ? 'Verified'
                : 'Required for withdrawals and certain payments'
            }
            onPress={() => router.push('/wallet/withdraw')}
          />
        </SettingsGroup>

        <SettingsGroup title="Preferences">
          <View className="gap-2 px-4 py-4">
            <Text className="text-base text-muted">Appearance</Text>
            <ThemePreferenceSegment value={preference} onChange={(next) => void setPreference(next)} />
          </View>
        </SettingsGroup>

        <SettingsGroup title="Wallet">
          <SettingsRow
            label="Wallet"
            description={
              wallet.data
                ? `Available ${formatMoney(wallet.data.available, wallet.data.currency)}`
                : undefined
            }
            onPress={() => router.push('/wallet' as Href)}
          />
          <SettingsRow
            label="Add money"
            onPress={() => router.push('/wallet/add')}
            showDivider
          />
        </SettingsGroup>

        <SettingsGroup title="Support">
          <SettingsRow
            label="Report a problem"
            onPress={() => setReportIssueOpen(true)}
          />
        </SettingsGroup>

        <View className="gap-3 pt-2">
          {leave.isError ? <InlineError error={leave.error} /> : null}
          <Pressable
            onPress={() => leave.mutate()}
            disabled={leave.isPending}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            className="items-center justify-center py-3 active:opacity-80"
          >
            <Text className="text-lg font-semibold text-danger">
              {leave.isPending ? 'Signing out…' : 'Sign out'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <ReportIssueModal
        visible={reportIssueOpen}
        issues={APP_REPORT_ISSUES}
        onClose={() => setReportIssueOpen(false)}
        onSubmit={() => {
          setReportIssueOpen(false);
          showAppToast('Thanks — we received your report');
        }}
      />
    </Screen>
  );
}