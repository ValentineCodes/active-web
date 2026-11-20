'use client';

import { format } from 'date-fns';
import { useRouter } from '@/lib/navigation';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { Button } from '@/components/ui/Button';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { useMyEntitlements, useStartPremiumTrial } from '@/features/projects/project-api';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { showAppToast } from '@/lib/toast';

export function PremiumSettingsPage() {
  const router = useRouter();
  const entitlements = useMyEntitlements();
  const startTrial = useStartPremiumTrial();

  if (showQuerySkeleton(entitlements)) {
    return (
      <FlowScreen title="Premium" backTo="/settings">
        <LoadingState />
      </FlowScreen>
    );
  }

  const data = entitlements.data;
  const trialUsed = Boolean(data?.premium_trial_started_at);
  const active = data?.premium_active ?? false;

  return (
    <FlowScreen title="Premium" backTo="/settings" bodyClassName="flex flex-col gap-4">
      <div className="rounded-2xl border border-hairline bg-elevated p-4 text-sm leading-5 text-muted">
        <p className="text-lg font-semibold text-ink">Collaborative projects</p>
        <p className="mt-2">
          Premium unlocks creating new projects. Separate from Crown. One 30-day trial without a
          payment card.
        </p>
        <p className="mt-2 font-medium text-ink">
          {active ? 'Trial active' : trialUsed ? 'Trial ended' : 'Standard'}
        </p>
        {data?.premium_trial_ends_at ? (
          <p className="mt-1">Ends {format(new Date(data.premium_trial_ends_at), 'MMM d, yyyy')}</p>
        ) : null}
        <p className="mt-2 text-xs text-subtle">
          Existing projects remain accessible after trial expiry; only new creation is gated.
        </p>
      </div>

      {!trialUsed ? (
        <Button
          label={startTrial.isPending ? 'Starting…' : 'Start 30-day trial'}
          disabled={startTrial.isPending}
          onClick={() =>
            startTrial.mutate(undefined, {
              onSuccess: () => {
                showAppToast('Premium trial started');
                void entitlements.refetch();
              },
              onError: (error) =>
                showAppToast(error instanceof Error ? error.message : 'Could not start trial', 'warning'),
            })
          }
        />
      ) : !active ? (
        <EmptyState
          icon="time-outline"
          title="Trial ended"
          message="Paid Premium is not configured in this release."
        />
      ) : null}

      <Button
        label="Create project"
        variant="secondary"
        disabled={!data?.can_create_projects}
        onClick={() => router.push('/project/new')}
      />

      {entitlements.isError ? <InlineError error={entitlements.error} /> : null}
    </FlowScreen>
  );
}