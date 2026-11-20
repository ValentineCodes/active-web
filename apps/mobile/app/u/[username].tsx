import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { CrownSummary } from '@/components/profile/CrownSummary';
import { IdentityVerifiedBadge } from '@/components/profile/IdentityVerifiedBadge';
import { AvatarWithViewer } from '@/components/profile/AvatarWithViewer';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { StarRating } from '@/components/ui/Stars';
import { PublicProfileSkeleton } from '@/components/ui/content-skeletons';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { usePublicProfile } from '@/features/profile/public-profile-api';

export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const profile = usePublicProfile(username);

  if (profile.isPending) {
    return (
      <Screen>
        <Header title="Profile" onBack={() => router.back()} />
        <PublicProfileSkeleton />
      </Screen>
    );
  }

  if (profile.isError) {
    const notFound =
      profile.error instanceof Error &&
      'code' in profile.error &&
      profile.error.code === 'not_found';
    if (notFound) {
      return (
        <Screen>
          <Header title="Profile" onBack={() => router.back()} />
          <EmptyState
            icon="person-outline"
            title="Profile not found"
            message="This username does not exist or is unavailable."
            action={{ label: 'Go back', onPress: () => router.back() }}
          />
        </Screen>
      );
    }

    return (
      <Screen>
        <Header title="Profile" onBack={() => router.back()} />
        <InlineError error={profile.error} onRetry={() => void profile.refetch()} />
      </Screen>
    );
  }

  const data = profile.data;
  const displayName = data.display_name ?? data.username;
  const showCrown = data.crown_tier !== 'hidden';

  return (
    <Screen edges={['top', 'bottom']} className="bg-canvas">
      <Header title={displayName} onBack={() => router.back()} />
      <View className="gap-5 px-5 pb-12 pt-4">
        <View className="items-center gap-2">
          <AvatarWithViewer path={data.avatar_path} name={displayName} size="lg" />
          <View className="flex-row items-center gap-1.5">
            <Text className="text-xl font-semibold text-ink">{displayName}</Text>
            {data.identity_verified ? <IdentityVerifiedBadge size={20} /> : null}
          </View>
          <Text className="text-base text-muted">@{data.username}</Text>
        </View>

        {data.bio ? <Text className="text-center text-base leading-6 text-ink">{data.bio}</Text> : null}

        {showCrown ? (
          <CrownSummary
            variant="compact"
            tier={data.crown_tier}
            points={data.points_main}
            shield={data.shield_remaining}
          />
        ) : null}

        <View className="flex-row rounded-2xl border border-hairline bg-elevated">
          <View className="flex-1 items-center gap-1 py-4">
            <Text className="text-2xl font-bold text-ink">{data.jobs_completed ?? 0}</Text>
            <Text className="text-sm text-muted">Jobs</Text>
          </View>
          <View className="w-px bg-hairline" />
          <View className="flex-1 items-center gap-1 py-4">
            <Text className="text-2xl font-bold text-ink">{data.requests_completed ?? 0}</Text>
            <Text className="text-sm text-muted">Requests</Text>
          </View>
        </View>

        {data.rating_count != null && data.rating_count > 0 ? (
          <View className="items-center gap-1">
            <StarRating average={data.rating_average} count={data.rating_count} size="md" />
          </View>
        ) : null}

        <EmptyState
          icon="lock-closed-outline"
          title="Activity is private"
          message="Only approved public profile details are shown here."
        />
      </View>
    </Screen>
  );
}