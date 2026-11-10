import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';

import { ProfileStat, SettingsGroup, SettingsRow } from '@/components/profile/SettingsRow';
import { FlowScreen } from '@/components/layout/FlowScreen';
import { Avatar } from '@/components/ui/Avatar';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { StarRating } from '@/components/ui/Stars';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { MARKET } from '@/config/index';
import { hasProviderCommitments, useAttendance } from '@/features/attendance/api';
import { signOut } from '@/features/auth/api';
import { useMyIdentityStatus } from '@/features/identity/api';
import { hasProfilePhotoReady, useMyProfile } from '@/features/profile/api';
import { useMyResponses } from '@/features/requests/responses-api';
import { useMyRequests } from '@/features/requests/requester-api';
import { useMyWallet } from '@/features/wallet/api';
import { formatMoney, formatPhoneDisplay } from '@/lib/format';
import { showAppToast } from '@/lib/toast';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';

export function ProfilePage() {
  const navigate = useNavigate();
  const profile = useMyProfile();
  const identityStatus = useMyIdentityStatus();
  const attendance = useAttendance();
  const myRequests = useMyRequests();
  const myResponses = useMyResponses();
  const wallet = useMyWallet();
  const leave = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      window.location.href = '/welcome';
    },
  });

  if (showQuerySkeleton(profile)) {
    return (
      <FlowScreen title="Profile" backTo="/home">
        <LoadingState />
      </FlowScreen>
    );
  }

  const data = profile.data;
  if (!data) {
    return (
      <FlowScreen title="Profile" backTo="/home">
        <EmptyState icon="person-outline" title="Profile unavailable" message="Refresh when you are back online." />
      </FlowScreen>
    );
  }

  const hasCommitments = hasProviderCommitments(attendance.data);
  const completed = (data.jobs_completed ?? 0) + (data.requests_completed ?? 0);
  const activeRequests =
    myRequests.data?.filter((request) =>
      ['posted', 'searching', 'accepted', 'in_progress', 'completion_pending'].includes(request.status),
    ).length ?? 0;
  const responseCount = myResponses.data?.length ?? 0;
  const ratingCount = data.rating_count ?? 0;
  const ratingAverage = ratingCount > 0 && data.rating_average !== null ? data.rating_average : null;
  const photoReady = hasProfilePhotoReady(data);

  return (
    <FlowScreen title="Profile" backTo="/home" bodyClassName="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <Avatar path={data.avatar_path} name={data.display_name} size="lg" showActiveDot={hasCommitments} />
        <p className="max-w-full truncate text-2xl font-bold text-ink">{data.display_name}</p>
        {ratingAverage !== null || completed > 0 ? (
          <RatingRow ratingAverage={ratingAverage} ratingCount={ratingCount} completed={completed} />
        ) : null}
        {data.bio ? <p className="max-w-sm text-base leading-6 text-muted">{data.bio}</p> : null}
        {data.phone ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(data.phone!);
              showAppToast('Phone number copied');
            }}
            className="mt-2 inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 active:opacity-80"
          >
            <IonIcon icon={ionIcons['copy-outline']} size={14} color="#1FA35A" />
            <span className="text-base font-medium text-muted">{formatPhoneDisplay(data.phone)}</span>
          </button>
        ) : null}
        <p className="text-xs text-muted">
          {photoReady
            ? 'Profile photo captured in Active.'
            : 'Take a live profile photo before you can send chat messages.'}
        </p>
        {identityStatus.data?.identityVerified ? (
          <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">Verified ID</span>
        ) : null}
      </div>

      <div className="flex flex-row overflow-hidden rounded-2xl border border-hairline bg-elevated">
        <ProfileStat value={activeRequests} label="Requests" />
        <StatDivider />
        <ProfileStat value={completed} label="Completed" />
        <StatDivider />
        <ProfileStat value={responseCount} label="Responses" />
      </div>

      <button
        type="button"
        onClick={() => navigate('/wallet')}
        className="shadow-card flex flex-row items-center gap-3 rounded-2xl border border-hairline bg-elevated px-4 py-4 active:opacity-90"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-active-soft text-lg font-bold text-active">
          {MARKET.currencySymbol}
        </span>
        <span className="min-w-0 flex-1 text-left text-lg font-semibold text-ink">Wallet</span>
        <span className="flex shrink-0 items-center gap-0.5">
          {wallet.data ? (
            <span className="text-sm font-semibold text-ink">
              {formatMoney(wallet.data.available, wallet.data.currency)}
            </span>
          ) : (
            <span className="text-sm text-muted">—</span>
          )}
          <IonIcon icon={ionIcons['chevron-forward']} size={20} color="#8A948C" />
        </span>
      </button>

      <SettingsGroup title="Account">
        <SettingsRow label="Edit profile" to="/profile/edit" />
        <SettingsRow label="Bank accounts" to="/profile/bank-accounts" showDivider />
        <SettingsRow label="Install app" to="/install" showDivider />
      </SettingsGroup>

      <SettingsGroup title="Preferences">
        <SettingsRow label="Notification inbox" to="/notifications" />
      </SettingsGroup>

      <div className="flex flex-col gap-3 pt-2">
        {leave.isError ? <InlineError error={leave.error} /> : null}
        <button
          type="button"
          disabled={leave.isPending}
          onClick={() => leave.mutate()}
          className="py-3 text-center text-lg font-semibold text-danger active:opacity-80 disabled:opacity-50"
        >
          {leave.isPending ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </FlowScreen>
  );
}

function RatingRow({
  ratingAverage,
  ratingCount,
  completed,
}: {
  ratingAverage: number | null;
  ratingCount: number;
  completed: number;
}) {
  return (
    <div className="flex flex-row flex-wrap items-center justify-center gap-x-1.5">
      {ratingAverage !== null ? <StarRating average={ratingAverage} count={ratingCount} size="md" /> : null}
      {ratingAverage !== null && completed > 0 ? <span className="text-base text-muted">·</span> : null}
      {completed > 0 ? <span className="text-base font-medium text-muted">{completed} completed</span> : null}
    </div>
  );
}

function StatDivider() {
  return <span className="w-px self-stretch bg-hairline" aria-hidden />;
}
