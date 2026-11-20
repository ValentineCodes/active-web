import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { type Href, router, useLocalSearchParams } from 'expo-router';

import { ProfileCatalogueRail } from '@/components/ProfileCatalogueRail';
import { ProfileTagInterestsLine } from '@/components/profile/ProfileTagInterestsLine';
import { CrownSummary } from '@/components/profile/CrownSummary';
import { ProfileHubActivityList } from '@/components/profile/ProfileHubActivityList';
import { ProfileStickyTabs, type ProfileHubTab } from '@/components/profile/ProfileStickyTabs';
import { IdentityVerifiedBadge } from '@/components/profile/IdentityVerifiedBadge';
import { AvatarWithViewer } from '@/components/profile/AvatarWithViewer';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, LoadingState } from '@/components/ui/StateView';
import { hasProviderCommitments, useAttendance } from '@/features/attendance/api';
import { useMyIdentityStatus } from '@/features/identity/api';
import { useNotificationTagInterests } from '@/features/notifications/tag-interests';
import { useProfile } from '@/features/profile/api';
import { useMyReputation } from '@/features/profile/reputation-api';
import { useMyResponses } from '@/features/requests/responses-api';
import { useMyRequests } from '@/features/requests/requester-api';
import { formatPhoneDisplay } from '@/lib/format';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';

function profileTabFromParam(value: string | string[] | undefined): ProfileHubTab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'responses' || raw === 'projects' || raw === 'requests') return raw;
  return 'requests';
}

function ProfileStat({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 items-center gap-0.5">
      <Text className="text-xl font-bold text-ink">{value}</Text>
      <Text className="text-xs font-medium text-muted">{label}</Text>
    </View>
  );
}

export default function ProfileHubScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();

  const profile = useProfile();
  const identityStatus = useMyIdentityStatus();
  const attendance = useAttendance();
  const myRequests = useMyRequests();
  const myResponses = useMyResponses();
  const reputation = useMyReputation();
  const tagInterests = useNotificationTagInterests();

  const [activeTab, setActiveTab] = useState<ProfileHubTab>(() => profileTabFromParam(params.tab));

  useEffect(() => {
    setActiveTab(profileTabFromParam(params.tab));
  }, [params.tab]);

  const onSelectTab = useCallback((tab: ProfileHubTab) => {
    setActiveTab(tab);
  }, []);

  const stats = useMemo(() => {
    const data = profile.data;
    if (!data) return null;
    const completed = (data.jobs_completed ?? 0) + (data.requests_completed ?? 0);
    const activeRequests =
      myRequests.data?.filter((request) =>
        ['posted', 'searching', 'accepted', 'in_progress', 'completion_pending'].includes(
          request.status,
        ),
      ).length ?? 0;
    const responseCount = myResponses.data?.length ?? 0;
    return { data, completed, activeRequests, responseCount };
  }, [myRequests.data, myResponses.data, profile.data]);

  const headerActions = (
    <View className="flex-row items-center gap-0.5">
      <IconButton
        icon="create-outline"
        variant="surface"
        accessibilityLabel="Edit profile"
        onPress={() => router.push('/profile/edit')}
      />
      <IconButton
        icon="settings-outline"
        variant="surface"
        accessibilityLabel="Settings"
        onPress={() => router.push('/settings' as Href)}
      />
    </View>
  );

  if (showQuerySkeleton(profile)) {
    return (
      <Screen className="bg-canvas">
        <Header title="Profile" onBack={() => router.back()} right={headerActions} />
        <LoadingState />
      </Screen>
    );
  }

  if (!stats) {
    return (
      <Screen className="bg-canvas">
        <Header title="Profile" onBack={() => router.back()} right={headerActions} />
        <EmptyState
          icon="person-outline"
          title="Profile unavailable"
          message="Pull to refresh when you are back online."
        />
      </Screen>
    );
  }

  const { data, completed, activeRequests, responseCount } = stats;
  const hasCommitments = hasProviderCommitments(attendance.data);
  const crownTier = reputation.data?.crown_tier ?? 'none';
  const crownPoints = reputation.data?.points_main ?? 0;
  const crownShield = reputation.data?.shield_remaining ?? 0;

  const profileListHeader = useMemo(
    () => (
    <View className="gap-4 px-5 pb-2">
      <View className="items-center gap-3 pt-1">
        <AvatarWithViewer
          path={data.avatar_path}
          name={data.display_name}
          size="lg"
          showActiveDot={hasCommitments}
        />

        <View className="w-full items-center gap-1.5">
          <View className="flex-row flex-wrap items-center justify-center gap-1.5">
            <Text className="text-center text-2xl font-bold text-ink" numberOfLines={2}>
              {data.display_name}
            </Text>
            {identityStatus.data?.identityVerified ? <IdentityVerifiedBadge size={20} /> : null}
          </View>

          {data.username ? (
            <Pressable
              onPress={() => router.push(`/u/${data.username}` as Href)}
              accessibilityRole="link"
              accessibilityLabel={`Public profile at ${data.username}`}
              className="active:opacity-80"
            >
              <Text className="text-base font-medium text-active">@{data.username}</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push('/profile/edit')} className="active:opacity-80">
              <Text className="text-base font-medium text-active">Claim a username</Text>
            </Pressable>
          )}

          {data.bio ? (
            <Text className="max-w-sm text-center text-base leading-6 text-muted" numberOfLines={4}>
              {data.bio}
            </Text>
          ) : null}

          {data.phone ? (
            <Text className="text-base text-muted">{formatPhoneDisplay(data.phone)}</Text>
          ) : null}
        </View>

        <CrownSummary
          tier={crownTier}
          points={crownPoints}
          shield={crownShield}
          nextTier={reputation.data?.next_tier ?? null}
          pointsToNext={reputation.data?.points_to_next_tier ?? null}
          loading={reputation.isPending}
        />

        <View className="w-full flex-row rounded-3xl border border-hairline bg-elevated px-2 py-4">
          <ProfileStat value={activeRequests} label="Requests" />
          <View className="w-px self-stretch bg-hairline" />
          <ProfileStat value={responseCount} label="Responses" />
          <View className="w-px self-stretch bg-hairline" />
          <ProfileStat value={completed} label="Completed" />
        </View>
      </View>

      <ProfileTagInterestsLine tags={tagInterests.data ?? []} />
      <ProfileCatalogueRail />

      <ProfileStickyTabs active={activeTab} onChange={onSelectTab} />
    </View>
    ),
    [
      activeTab,
      activeRequests,
      completed,
      crownPoints,
      crownShield,
      crownTier,
      data,
      hasCommitments,
      identityStatus.data?.identityVerified,
      onSelectTab,
      responseCount,
      reputation.data?.next_tier,
      reputation.data?.points_to_next_tier,
      reputation.isPending,
      tagInterests.data,
    ],
  );

  return (
    <Screen className="bg-canvas">
      <Header title="Profile" onBack={() => router.back()} right={headerActions} />
      <View className="min-h-0 flex-1">
        <ProfileHubActivityList activeTab={activeTab} listHeader={profileListHeader} />
      </View>
    </Screen>
  );
}