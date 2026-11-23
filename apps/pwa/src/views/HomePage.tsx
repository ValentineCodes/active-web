'use client';

import { HomeActiveRequestBanner } from '@/components/home/HomeActiveRequestBanner';
import { HomeFeedHeader } from '@/components/home/HomeFeedHeader';
import { HomeFeed } from '@/components/marketplace/HomeFeed';
import { Screen } from '@/components/ui/Screen';
import { InlineError, LoadingState } from '@/components/ui/StateView';
import { useAttendance } from '@/features/attendance/api';
import { pickHomeActiveRequest } from '@/features/requests/home-active-request';
import { useMyRequests } from '@/features/requests/requester-api';
import { useMyResponses } from '@/features/requests/responses-api';
import { useOptionalMyProfile } from '@/features/profile/api';
import { useHasSession } from '@/features/auth/use-user-id';
import { showHomeActiveRequestBanner } from '@/features/home/home-guest';
import { useMyWallet } from '@/features/wallet/api';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';

export function HomePage() {
  const hasSession = useHasSession();
  const profile = useOptionalMyProfile();
  const attendance = useAttendance();
  const requests = useMyRequests();
  const responses = useMyResponses();
  const wallet = useMyWallet();

  const activeRequest = pickHomeActiveRequest(requests.data, responses.data);
  const profileSkeleton = showQuerySkeleton(profile);

  if (hasSession && profile.isLoading && !profile.data) return <LoadingState label="Loading…" />;
  if (hasSession && profile.isError) {
    return (
      <Screen className="px-5 pt-4">
        <InlineError error={profile.error} />
      </Screen>
    );
  }

  return (
    <Screen className="h-full min-h-0 overflow-hidden bg-canvas">
      <PlusMaybeActiveBanner
        hasSession={hasSession}
        guest={!hasSession}
        activeRequest={activeRequest}
        profileSkeleton={profileSkeleton}
        profile={profile}
        attendance={attendance}
        wallet={wallet}
      />
    </Screen>
  );
}

function PlusMaybeActiveBanner({
  hasSession,
  guest,
  activeRequest,
  profileSkeleton,
  profile,
  attendance,
  wallet,
}: {
  hasSession: boolean;
  guest: boolean;
  activeRequest: ReturnType<typeof pickHomeActiveRequest>;
  profileSkeleton: boolean;
  profile: ReturnType<typeof useOptionalMyProfile>;
  attendance: ReturnType<typeof useAttendance>;
  wallet: ReturnType<typeof useMyWallet>;
}) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col ${activeRequest ? 'gap-2' : ''}`}>
      <HomeFeedHeader
        guest={guest}
        loading={profileSkeleton}
        displayName={profile.data?.display_name ?? null}
        avatarPath={profile.data?.avatar_path ?? null}
        attendance={attendance.data}
        walletAvailable={wallet.data?.available ?? null}
        walletCurrency={wallet.data?.currency ?? null}
      />
      {showHomeActiveRequestBanner(hasSession, activeRequest) && activeRequest ? (
        <HomeActiveRequestBanner title={activeRequest.title} to={`/engagement/${activeRequest.id}`} />
      ) : null}
      <HomeFeed searchQuery="" />
    </div>
  );
}
