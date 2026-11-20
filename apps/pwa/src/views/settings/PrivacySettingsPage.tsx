'use client';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { InlineError, LoadingState } from '@/components/ui/StateView';
import { useMyReputation, useSetCrownPublic } from '@/features/profile/reputation-api';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { showAppToast } from '@/lib/toast';

export function PrivacySettingsPage() {
  const reputation = useMyReputation();
  const setCrownPublic = useSetCrownPublic();
  const crownVisible = reputation.data?.crown_public ?? true;

  if (showQuerySkeleton(reputation)) {
    return (
      <FlowScreen title="Privacy" backTo="/settings">
        <LoadingState />
      </FlowScreen>
    );
  }

  return (
    <FlowScreen title="Privacy" backTo="/settings">
      <div className="rounded-2xl border border-hairline bg-elevated p-4">
        <label className="flex flex-row items-start justify-between gap-4">
          <span className="min-w-0 flex-1 flex-col gap-1">
            <span className="text-lg font-semibold text-ink">Show Crown on public profile</span>
            <span className="mt-1 block text-sm leading-5 text-muted">
              When off, others cannot see your Crown tier or points. Your points are unchanged and
              you still see your full Crown on Profile.
            </span>
          </span>
          <input
            type="checkbox"
            className="mt-1 h-5 w-5"
            checked={crownVisible}
            disabled={setCrownPublic.isPending}
            onChange={(event) => {
              const next = event.target.checked;
              setCrownPublic.mutate(next, {
                onSuccess: () =>
                  showAppToast(next ? 'Crown visible publicly' : 'Crown hidden on public profile'),
                onError: (error) =>
                  showAppToast(
                    error instanceof Error ? error.message : 'Could not update Crown visibility',
                    'warning',
                  ),
              });
            }}
          />
        </label>
      </div>
      {setCrownPublic.isError ? <InlineError error={setCrownPublic.error} /> : null}
    </FlowScreen>
  );
}