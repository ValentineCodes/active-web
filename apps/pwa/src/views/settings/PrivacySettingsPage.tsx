'use client';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { InlineError, LoadingState } from '@/components/ui/StateView';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
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
        <div className="flex flex-row items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-ink">Show Crown on public profile</p>
            <p className="mt-1 text-sm leading-5 text-muted">
              When off, others cannot see your Crown tier or points. Your points are unchanged and
              you still see your full Crown on Profile.
            </p>
          </div>
          <ToggleSwitch
            aria-label="Show Crown on public profile"
            checked={crownVisible}
            disabled={setCrownPublic.isPending}
            onChange={(next) => {
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
        </div>
      </div>
      {setCrownPublic.isError ? <InlineError error={setCrownPublic.error} /> : null}
    </FlowScreen>
  );
}