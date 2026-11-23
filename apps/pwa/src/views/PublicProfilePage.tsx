'use client';

import { useParams, useRouter } from '@/lib/navigation';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { AvatarWithViewer } from '@/components/profile/AvatarWithViewer';
import { CrownSummary } from '@/components/profile/CrownSummary';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { PublicProfileSkeleton } from '@/components/ui/content-skeletons';
import { publicProfileShowsCrown } from '@/features/marketplace/guest-view';
import { usePublicProfile } from '@/features/profile/public-profile-api';

export function PublicProfilePage() {
  const router = useRouter();
  const params = useParams();
  const username = typeof params.username === 'string' ? params.username : '';
  const profile = usePublicProfile(username);

  if (profile.isPending) {
    return (
      <FlowScreen title="Profile" backTo="/search">
        <PublicProfileSkeleton />
      </FlowScreen>
    );
  }

  if (profile.isError) {
    const notFound =
      profile.error instanceof Error &&
      'code' in profile.error &&
      profile.error.code === 'not_found';
    return (
      <FlowScreen title="Profile" backTo="/search">
        {notFound ? (
          <EmptyState
            icon="person-outline"
            title="Profile not found"
            message="This username does not exist or is unavailable."
            action={{ label: 'Go back', onPress: () => router.back() }}
          />
        ) : (
          <InlineError error={profile.error} />
        )}
      </FlowScreen>
    );
  }

  const data = profile.data;
  const displayName = data.display_name ?? data.username;
  const showCrown = publicProfileShowsCrown(data.crown_public, data.crown_tier);

  return (
    <FlowScreen title={displayName} backTo="/search" bodyClassName="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <AvatarWithViewer path={data.avatar_path} name={displayName} size="lg" />
        <p className="text-xl font-semibold text-ink">{displayName}</p>
        <p className="text-base text-muted">@{data.username}</p>
        {data.bio ? <p className="max-w-sm text-center text-base leading-6 text-muted">{data.bio}</p> : null}
      </div>

      {showCrown ? (
        <CrownSummary
          variant="compact"
          tier={data.crown_tier}
          points={data.points_main}
          shield={data.shield_remaining}
        />
      ) : null}

      <div className="flex rounded-2xl border border-hairline bg-elevated">
        <div className="flex-1 py-4 text-center">
          <p className="text-2xl font-bold text-ink">{data.jobs_completed ?? 0}</p>
          <p className="text-sm text-muted">Jobs</p>
        </div>
        <div className="w-px bg-hairline" />
        <div className="flex-1 py-4 text-center">
          <p className="text-2xl font-bold text-ink">{data.requests_completed ?? 0}</p>
          <p className="text-sm text-muted">Requests</p>
        </div>
      </div>

      <EmptyState
        icon="lock-closed-outline"
        title="Activity is private"
        message="Only approved public profile details are shown here."
      />
    </FlowScreen>
  );
}