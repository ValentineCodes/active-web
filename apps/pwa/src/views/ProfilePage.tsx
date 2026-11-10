'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { ProfileCatalogueRail } from '@/components/profile/ProfileCatalogueRail';
import { ProfileStat, SettingsGroup, SettingsRow } from '@/components/profile/SettingsRow';
import { Avatar } from '@/components/ui/Avatar';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { StarRating } from '@/components/ui/Stars';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { MARKET } from '@/config/index';
import { hasProviderCommitments, useAttendance } from '@/features/attendance/api';
import { signOut } from '@/features/auth/api';
import { useMyIdentityStatus } from '@/features/identity/api';
import { useMyProfile } from '@/features/profile/api';
import { useMyResponses } from '@/features/requests/responses-api';
import { useMyRequests } from '@/features/requests/requester-api';
import { useMyWallet } from '@/features/wallet/api';
import { formatMoney, formatPhoneDisplay } from '@/lib/format';
import { showAppToast } from '@/lib/toast';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { ReportIssueModal } from '@/components/support/ReportIssueModal';
import { ThemePreferenceSegment } from '@/components/settings/ThemePreferenceSegment';
import { APP_REPORT_ISSUES } from '@/features/support/report-issue-options';
import { useColors, useTheme } from '@/theme/ThemeProvider';

export function ProfilePage() {
  const router = useRouter();
  const { preference, setPreference } = useTheme();
  const colors = useColors();
  const profile = useMyProfile();
  const identityStatus = useMyIdentityStatus();
  const attendance = useAttendance();
  const myRequests = useMyRequests();
  const myResponses = useMyResponses();
  const wallet = useMyWallet();
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const leave = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      window.location.href = '/welcome';
    },
  });

  const goBack = () => router.push('/home');

  if (showQuerySkeleton(profile)) {
    return (
      <FlowScreen title="Profile" onBack={goBack}>
        <LoadingState />
      </FlowScreen>
    );
  }

  const data = profile.data;
  if (!data) {
    return (
      <FlowScreen title="Profile" onBack={goBack}>
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

  return (
    <FlowScreen title="Profile" onBack={goBack}>
      <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <Avatar path={data.avatar_path} name={data.display_name} size="lg" showActiveDot={hasCommitments} />
        <div className="flex max-w-full flex-row items-center justify-center gap-1.5">
          <p className="min-w-0 truncate text-xl font-bold text-ink">{data.display_name}</p>
          {identityStatus.data?.identityVerified ? (
            <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">
              Verified
            </span>
          ) : null}
        </div>
        <RatingRow ratingAverage={ratingAverage} ratingCount={ratingCount} completed={completed} />
        {data.bio ? <p className="max-w-sm text-sm leading-5 text-muted">{data.bio}</p> : null}
        {data.phone ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(data.phone!);
              showAppToast('Phone number copied');
            }}
            className="mt-2 inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 active:opacity-80"
          >
            <IonIcon icon={ionIcons['copy-outline']} size={14} color={colors.active} />
            <span className="text-sm font-medium text-muted">{formatPhoneDisplay(data.phone)}</span>
          </button>
        ) : null}
      </div>

      <div
        aria-label="Your activity"
        className="flex w-full flex-row overflow-hidden rounded-2xl border border-hairline bg-elevated"
      >
        <ProfileStat value={activeRequests} label="Requests" />
        <div className="w-px shrink-0 bg-hairline" aria-hidden />
        <ProfileStat value={completed} label="Completed" />
        <div className="w-px shrink-0 bg-hairline" aria-hidden />
        <ProfileStat value={responseCount} label="Responses" />
      </div>

      <ProfileCatalogueRail />

      <button
        type="button"
        onClick={() => router.push('/wallet')}
        className="shadow-card flex flex-row items-center gap-3 rounded-2xl border border-hairline bg-elevated px-4 py-4 active:opacity-90"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-active-soft text-base font-bold text-active">
          {MARKET.currencySymbol}
        </span>
        <span className="min-w-0 flex-1 text-left text-base font-semibold text-ink">Wallet</span>
        <span className="flex shrink-0 items-center gap-0.5">
          {wallet.data ? (
            <span className="text-xs font-semibold text-ink">
              {formatMoney(wallet.data.available, wallet.data.currency)}
            </span>
          ) : (
            <span className="text-xs text-muted">—</span>
          )}
          <IonIcon icon={ionIcons['chevron-forward']} size={20} color={colors.subtle} />
        </span>
      </button>

      <SettingsGroup title="Account">
        <SettingsRow label="Edit profile" to="/profile/edit" />
        <SettingsRow label="Saved places" to="/profile/locations" showDivider />
        <SettingsRow label="Bank accounts" to="/profile/bank-accounts" showDivider />
      </SettingsGroup>

      <SettingsGroup title="Preferences">
        <SettingsRow label="Notifications" to="/notification-settings" />
        <div className="mx-4 h-px bg-hairline" />
        <div className="flex flex-col gap-2 px-4 py-4">
          <p className="text-sm text-muted">Appearance</p>
          <ThemePreferenceSegment value={preference} onChange={setPreference} />
        </div>
        <SettingsRow label="Privacy" onClick={() => {}} showDivider />
      </SettingsGroup>

      <SettingsGroup title="Support">
        <SettingsRow label="Help & support" onClick={() => {}} />
        <SettingsRow label="Report a problem" onClick={() => setReportIssueOpen(true)} showDivider />
        <SettingsRow label="About Active" onClick={() => {}} showDivider />
        <SettingsRow label="Install app" to="/install" showDivider />
      </SettingsGroup>

      <div className="flex flex-col gap-3 pt-2">
        {leave.isError ? <InlineError error={leave.error} /> : null}
        <button
          type="button"
          disabled={leave.isPending}
          onClick={() => leave.mutate()}
          className="py-3 text-center text-base font-semibold text-danger active:opacity-80 disabled:opacity-50"
        >
          {leave.isPending ? 'Signing out…' : 'Sign out'}
        </button>
      </div>

      <ReportIssueModal
        open={reportIssueOpen}
        issues={APP_REPORT_ISSUES}
        onClose={() => setReportIssueOpen(false)}
        onSubmit={() => showAppToast('Thanks — we received your report')}
      />
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
  if (ratingAverage === null && completed === 0) {
    return null;
  }

  return (
    <div className="flex flex-row flex-wrap items-center justify-center gap-x-1.5">
      {ratingAverage !== null ? <StarRating average={ratingAverage} count={ratingCount} size="md" /> : null}
      {ratingAverage !== null && completed > 0 ? <span className="text-sm text-muted">·</span> : null}
      {completed > 0 ? <span className="text-sm font-medium text-muted">{completed} completed</span> : null}
    </div>
  );
}
