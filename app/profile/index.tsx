import { type ReactNode, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { ProfileCatalogueRail } from '@/components/ProfileCatalogueRail';
import { ReportIssueModal } from '@/components/ReportIssueModal';
import { Avatar } from '@/components/ui/Avatar';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { hasProviderCommitments, useAttendance } from '@/features/attendance/api';
import { MARKET } from '@/config';
import { signOut } from '@/features/auth/api';
import { useProfile } from '@/features/profile/api';
import { formatPhoneDisplay } from '@/lib/format';
import { APP_REPORT_ISSUES } from '@/features/support/report-issue-options';
import { showAppToast } from '@/lib/toast';
import { useMyResponses } from '@/features/requests/responses-api';
import { useMyRequests } from '@/features/requests/requester-api';
import { ThemePreferenceSegment } from '@/components/settings/ThemePreferenceSegment';
import { useColors, useTheme } from '@/theme';

function ProfileStat({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 items-center gap-1 py-4">
      <Text className="text-2xl font-bold text-ink">{value}</Text>
      <Text className="text-sm text-muted">{label}</Text>
    </View>
  );
}

function SettingsRow({
  label,
  onPress,
  showDivider,
}: {
  label: string;
  onPress: () => void;
  showDivider?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="active:opacity-90"
    >
      {showDivider ? <View className="mx-4 h-px bg-hairline" /> : null}
      <View className="flex-row items-center justify-between px-4 py-4">
        <Text className="text-lg text-ink">{label}</Text>
        <Ionicons name="chevron-forward" size={20} color={colors.subtle} />
      </View>
    </Pressable>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-subtle">
        {title}
      </Text>
      <View className="overflow-hidden rounded-2xl border border-hairline bg-elevated">
        {children}
      </View>
    </View>
  );
}

function AppearancePreferenceSection() {
  const { preference, setPreference } = useTheme();

  return (
    <View className="gap-2 px-4 py-4">
      <Text className="text-base text-muted">Appearance</Text>
      <ThemePreferenceSegment value={preference} onChange={(next) => void setPreference(next)} />
    </View>
  );
}

export default function ProfileScreen() {
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const colors = useColors();
  const profile = useProfile();
  const attendance = useAttendance();
  const myRequests = useMyRequests();
  const myResponses = useMyResponses();
  const leave = useMutation({ mutationFn: signOut });

  if (profile.isPending) {
    return (
      <Screen>
        <Header title="Profile" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (profile.isError) {
    return (
      <Screen>
        <Header title="Profile" onBack={() => router.back()} />
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      </Screen>
    );
  }

  const { data } = profile;
  const hasCommitments = hasProviderCommitments(attendance.data);
  const completed = data.jobs_completed + data.requests_completed;
  const activeRequests =
    myRequests.data?.filter((request) =>
      ['posted', 'searching', 'accepted', 'in_progress', 'completion_pending'].includes(
        request.status,
      ),
    ).length ?? 0;
  const responseCount = myResponses.data?.length ?? 0;

  const ratingAverage =
    data.rating_count > 0 && data.rating_average !== null ? data.rating_average : null;

  return (
    <Screen>
      <Header title="Profile" onBack={() => router.back()} />

      <ScrollView
        contentContainerClassName="gap-6 px-5 pb-12 pt-2"
        refreshControl={
          <RefreshControl
            refreshing={profile.isRefetching || attendance.isRefetching}
            onRefresh={() => {
              profile.refetch();
              attendance.refetch();
              myRequests.refetch();
              myResponses.refetch();
            }}
          />
        }
      >
        <View className="items-center gap-2">
          <Avatar
            path={data.avatar_path}
            name={data.display_name}
            size="lg"
            showActiveDot={hasCommitments}
          />
          <Text className="text-2xl font-bold text-ink">{data.display_name}</Text>
          {ratingAverage !== null || completed > 0 ? (
            <View className="flex-row flex-wrap items-center justify-center gap-x-1.5">
              {ratingAverage !== null ? (
                <>
                  <Ionicons name="star" size={16} color={colors.warning} />
                  <Text className="text-base font-medium text-warning">
                    {ratingAverage.toFixed(1)}
                  </Text>
                </>
              ) : null}
              {ratingAverage !== null && completed > 0 ? (
                <Text className="text-base text-muted">·</Text>
              ) : null}
              {completed > 0 ? (
                <Text className="text-base font-medium text-muted">{completed} completed</Text>
              ) : null}
            </View>
          ) : null}
          {data.bio ? (
            <Text className="max-w-sm text-center text-base leading-6 text-muted">{data.bio}</Text>
          ) : null}
        </View>

        <View className="flex-row overflow-hidden rounded-2xl border border-hairline bg-elevated">
          <ProfileStat value={activeRequests} label="Requests" />
          <View className="w-px bg-hairline" />
          <ProfileStat value={completed} label="Completed" />
          <View className="w-px bg-hairline" />
          <ProfileStat value={responseCount} label="Responses" />
        </View>

        <ProfileCatalogueRail />

        <Pressable
          onPress={() => router.push('/wallet')}
          accessibilityRole="button"
          accessibilityLabel="Wallet"
          accessibilityHint="Balance, locked money, and activity"
          className="flex-row items-center gap-3 rounded-2xl border border-hairline bg-elevated px-4 py-4 active:opacity-90"
        >
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-active-soft">
            <Text className="text-lg font-bold text-active">{MARKET.currencySymbol}</Text>
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-lg font-semibold text-ink">Wallet</Text>
            <Text className="text-sm text-muted">Available balance and history</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.subtle} />
        </Pressable>

        {data.phone ? (
          <Pressable
            onPress={() => {
              void Clipboard.setStringAsync(data.phone!);
              showAppToast('Phone number copied');
            }}
            accessibilityRole="button"
            accessibilityLabel={`Phone number ${formatPhoneDisplay(data.phone)}`}
            accessibilityHint="Copies your phone number"
            className="flex-row items-center gap-3 rounded-2xl border border-hairline bg-elevated px-4 py-3.5 active:opacity-90"
          >
            <Ionicons name="call-outline" size={22} color={colors.active} />
            <Text className="min-w-0 flex-1 text-lg text-ink">
              {formatPhoneDisplay(data.phone)}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.subtle} />
          </Pressable>
        ) : null}

        <SettingsGroup title="Account">
          <SettingsRow label="Edit profile" onPress={() => router.push('/profile/edit')} />
          <SettingsRow label="Payment details" onPress={() => router.push('/wallet')} showDivider />
          <SettingsRow label="Verify identity" onPress={() => {}} showDivider />
        </SettingsGroup>

        <SettingsGroup title="Preferences">
          <SettingsRow
            label="Notifications"
            onPress={() => router.push('/notification-settings')}
          />
          <View className="mx-4 h-px bg-hairline" />
          <AppearancePreferenceSection />
          <SettingsRow label="Privacy" onPress={() => {}} showDivider />
          <SettingsRow label="Language" onPress={() => {}} showDivider />
        </SettingsGroup>

        <SettingsGroup title="Support">
          <SettingsRow label="Help & support" onPress={() => {}} />
          <SettingsRow
            label="Report a problem"
            onPress={() => setReportIssueOpen(true)}
            showDivider
          />
          <SettingsRow label="About Active" onPress={() => {}} showDivider />
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
