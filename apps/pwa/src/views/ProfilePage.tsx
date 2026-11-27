'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Link from '@/components/AppLink';
import { ProfileCatalogueRail } from '@/components/profile/ProfileCatalogueRail';
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
import { useMyProfile } from '@/features/profile/api';
import { useMyReputation } from '@/features/profile/reputation-api';
import { useMyCreatedProjects } from '@/features/projects/project-api';
import { useMyRequests } from '@/features/requests/requester-api';
import { formatPhoneDisplay } from '@/lib/format';
import { showAppToast } from '@/lib/toast';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { useRouter } from '@/lib/navigation';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

function profileTabFromParam(value: string | null): ProfileHubTab {
  if (value === 'responses' || value === 'projects' || value === 'requests') return value;
  return 'requests';
}

function ProfileStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5">
      <p className="text-xl font-bold text-ink">{value}</p>
      <p className="text-xs font-medium text-muted">{label}</p>
    </div>
  );
}

export function ProfilePage() {
  const router = useRouter();
  const colors = useColors();
  const [searchParams, setSearchParams] = useSearchParams();

  const profile = useMyProfile();
  const identityStatus = useMyIdentityStatus();
  const attendance = useAttendance();
  const myRequests = useMyRequests();
  const myCreatedProjects = useMyCreatedProjects();
  const reputation = useMyReputation();
  const tagInterests = useNotificationTagInterests();

  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<ProfileHubTab>(() => profileTabFromParam(tabParam));

  useEffect(() => {
    setActiveTab(profileTabFromParam(tabParam));
  }, [tabParam]);

  const onSelectTab = useCallback(
    (tab: ProfileHubTab) => {
      setActiveTab(tab);
      setSearchParams({ tab }, { replace: true });
    },
    [setSearchParams],
  );

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
    const projectCount = myCreatedProjects.data?.length ?? 0;
    return { data, completed, activeRequests, projectCount };
  }, [myRequests.data, myCreatedProjects.data, profile.data]);

  const headerActions = (
    <div className="flex shrink-0 flex-row items-center gap-4">
      <IconButton
        icon="create-outline"
        variant="surface"
        accessibilityLabel="Edit profile"
        onClick={() => router.push('/profile/edit')}
      />
      <IconButton
        icon="settings-outline"
        variant="surface"
        accessibilityLabel="Settings"
        onClick={() => router.push('/settings')}
      />
    </div>
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
          message="Refresh when you are back online."
        />
      </Screen>
    );
  }

  const { data, completed, activeRequests, projectCount } = stats;
  const hasCommitments = hasProviderCommitments(attendance.data);
  const crownTier = reputation.data?.crown_tier ?? 'none';
  const crownPoints = reputation.data?.points_main ?? 0;
  const crownShield = reputation.data?.shield_remaining ?? 0;

  const profileListHeader = (
    <div className="flex flex-col gap-4 pb-2">
      <div className="flex flex-col items-center gap-3 pt-1">
        <AvatarWithViewer
          path={data.avatar_path}
          name={data.display_name}
          size="lg"
          showActiveDot={hasCommitments}
        />

        <div className="flex w-full flex-col items-center gap-1.5">
          <div className="flex flex-row flex-wrap items-center justify-center gap-1.5">
            <p className="max-w-full text-center text-2xl font-bold text-ink">{data.display_name}</p>
            {identityStatus.data?.identityVerified ? <IdentityVerifiedBadge size={20} /> : null}
          </div>

          {data.username ? (
            <Link
              href={`/u/${data.username}`}
              className="text-base font-medium text-active active:opacity-80"
              aria-label={`Public profile at ${data.username}`}
            >
              @{data.username}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => router.push('/profile/edit')}
              className="text-base font-medium text-active active:opacity-80"
            >
              Claim a username
            </button>
          )}

          {data.bio ? (
            <p className="max-w-sm text-center text-base leading-6 text-muted">{data.bio}</p>
          ) : null}

          {data.phone ? (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(data.phone!);
                showAppToast('Phone number copied');
              }}
              className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 active:opacity-80"
            >
              <IonIcon icon={ionIcons['copy-outline']} size={14} color={colors.active} />
              <span className="text-sm font-medium text-muted">{formatPhoneDisplay(data.phone)}</span>
            </button>
          ) : null}
        </div>

        <CrownSummary
          tier={crownTier}
          points={crownPoints}
          shield={crownShield}
          nextTier={reputation.data?.next_tier ?? null}
          pointsToNext={reputation.data?.points_to_next_tier ?? null}
          loading={reputation.isPending}
        />

        <div
          aria-label="Your activity"
          className="flex w-full flex-row rounded-3xl border border-hairline bg-elevated px-2 py-4"
        >
          <ProfileStat value={activeRequests} label="Requests" />
          <div className="w-px self-stretch bg-hairline" aria-hidden />
          <ProfileStat value={projectCount} label="Projects" />
          <div className="w-px self-stretch bg-hairline" aria-hidden />
          <ProfileStat value={completed} label="Completed" />
        </div>
      </div>

      <ProfileTagInterestsLine tags={tagInterests.data ?? []} />
      <ProfileCatalogueRail />

      <ProfileStickyTabs active={activeTab} onChange={onSelectTab} />
    </div>
  );

  return (
    <Screen className="bg-canvas">
      <Header title="Profile" onBack={() => router.back()} right={headerActions} />
      <div className="min-h-0 flex-1">
        <ProfileHubActivityList activeTab={activeTab} listHeader={profileListHeader} />
      </div>
    </Screen>
  );
}