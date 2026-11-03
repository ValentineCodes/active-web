import { useCallback } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { HomeActiveRequestBanner } from '@/components/HomeActiveRequestBanner';
import { HomeFeed } from '@/components/home/HomeFeed';
import { HomeFeedHeader } from '@/components/home/HomeFeedHeader';
import { Screen } from '@/components/ui/Screen';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import { useAttendance } from '@/features/attendance/api';
import { useProfile } from '@/features/profile/api';
import { pickHomeActiveRequest } from '@/features/requests/home-active-request';
import { useMyResponses } from '@/features/requests/responses-api';
import { useMyRequests } from '@/features/requests/requester-api';
import { useMyWallet } from '@/features/wallet/api';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';

export default function HomeScreen() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  const activeSearchQuery = q?.trim() ?? '';

  const profile = useProfile();
  useQueryErrorToast(profile, { enabled: profile.isError && !profile.data });
  const attendance = useAttendance();
  const requests = useMyRequests();
  const responses = useMyResponses();
  const wallet = useMyWallet();

  const activeRequest = pickHomeActiveRequest(requests.data, responses.data);
  const profileSkeleton = showQuerySkeleton(profile);

  const openSearch = useCallback(() => {
    router.push({
      pathname: '/search',
      params: activeSearchQuery ? { q: activeSearchQuery } : undefined,
    });
  }, [activeSearchQuery]);

  return (
    <Screen className="bg-canvas">
      <View className={activeRequest ? 'gap-2 pb-0' : 'pb-0'}>
        <HomeFeedHeader
          loading={profileSkeleton}
          displayName={profile.data?.display_name ?? null}
          avatarPath={profile.data?.avatar_path ?? null}
          attendance={attendance.data}
          walletAvailable={wallet.data?.available ?? null}
          walletCurrency={wallet.data?.currency ?? null}
        />

        {activeRequest ? (
          <HomeActiveRequestBanner
            title={activeRequest.title}
            onPress={() => router.push(`/engagement/${activeRequest.id}`)}
          />
        ) : null}
      </View>

      <HomeFeed searchQuery={activeSearchQuery} onOpenSearch={openSearch} />
    </Screen>
  );
}
