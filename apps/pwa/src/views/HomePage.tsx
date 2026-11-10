'use client';

import { useSearchParams } from 'next/navigation';

import { HomeActiveRequestBanner } from '@/components/home/HomeActiveRequestBanner';
import { HomeFeedHeader } from '@/components/home/HomeFeedHeader';
import { HomeFeed } from '@/components/marketplace/HomeFeed';
import { Screen } from '@/components/ui/Screen';
import { InlineError, LoadingState } from '@/components/ui/StateView';
import { useAttendance } from '@/features/attendance/api';
import { pickHomeActiveRequest } from '@/features/requests/home-active-request';
import { useMyRequests } from '@/features/requests/requester-api';
import { useMyResponses } from '@/features/requests/responses-api';
import { useMyProfile } from '@/features/profile/api';
import { useMyWallet } from '@/features/wallet/api';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';

export function HomePage() {
  const params = useSearchParams();
  const searchQuery = params.get('q')?.trim() ?? '';
  const profile = useMyProfile();
  const attendance = useAttendance();
  const requests = useMyRequests();
  const responses = useMyResponses();
  const wallet = useMyWallet();

  const activeRequest = pickHomeActiveRequest(requests.data, responses.data);
  const profileSkeleton = showQuerySkeleton(profile);

  if (profile.isLoading && !profile.data) return <LoadingState label="Loading…" />;
  if (profile.isError) {
    return (
      <Screen className="px-5 pt-4">
        <InlineError error={profile.error} />
      </Screen>
    );
  }

  return (
    <Screen className="bg-canvas">
      <PlusMaybeActiveBanner activeRequest={activeRequest} profileSkeleton={profileSkeleton} profile={profile} attendance={attendance} wallet={wallet} searchQuery={searchQuery} />
    </Screen>
  );
}

function PlusMaybeActiveBanner({
  activeRequest,
  profileSkeleton,
  profile,
  attendance,
  wallet,
  searchQuery,
}: {
  activeRequest: ReturnType<typeof pickHomeActiveRequest>;
  profileSkeleton: boolean;
  profile: ReturnType<typeof useMyProfile>;
  attendance: ReturnType<typeof useAttendance>;
  wallet: ReturnType<typeof useMyWallet>;
  searchQuery: string;
}) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col ${activeRequest ? 'gap-2' : ''}`}>
      <HomeFeedHeader
        loading={profileSkeleton}
        displayName={profile.data?.display_name ?? null}
        avatarPath={profile.data?.avatar_path ?? null}
        attendance={attendance.data}
        walletAvailable={wallet.data?.available ?? null}
        walletCurrency={wallet.data?.currency ?? null}
      />
      {activeRequest ? (
        <HomeActiveRequestBanner title={activeRequest.title} to={`/engagement/${activeRequest.id}`} />
      ) : null}
      <HomeFeed searchQuery={searchQuery} />
    </div>
  );
}
