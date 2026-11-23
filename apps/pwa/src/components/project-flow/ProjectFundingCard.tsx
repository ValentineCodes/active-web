'use client';

import { IonIcon } from '@/components/ui/IonIcon';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ProjectBudgetBreakdown } from '@/components/project-flow/ProjectBudgetBreakdown';
import { ionIcons } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

type ProjectFundingCardProps = {
  budgetLabel: string;
  contributedLabel: string;
  progressPct: number;
  minTargetLabel: string;
  minTargetMet: boolean;
  whenLabel: string;
  locationLabel: string;
  fundingStatusLabel: string;
  showContributedProgress: boolean;
  onOpenContribute?: () => void;
  onOpenInvite?: () => void;
  currency: string;
  budgetBreakdown?: {
    paidOutKobo: number;
    reservedKobo: number;
    availableKobo: number;
  } | null;
};

export function ProjectFundingCard({
  budgetLabel,
  contributedLabel,
  progressPct,
  minTargetLabel,
  minTargetMet,
  whenLabel,
  locationLabel,
  fundingStatusLabel,
  showContributedProgress,
  onOpenContribute,
  onOpenInvite,
  currency,
  budgetBreakdown,
}: ProjectFundingCardProps) {
  const colors = useColors();
  const statusTone =
    fundingStatusLabel === 'open' ? 'active' : fundingStatusLabel.includes('fund') ? 'brand' : 'neutral';

  return (
    <div className="shadow-card flex w-full shrink-0 flex-col gap-4 overflow-hidden rounded-2xl border border-hairline bg-elevated p-4">
      <div className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0 flex-1 gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Total budget</p>
          <p className="text-3xl font-bold text-active">{budgetLabel}</p>
        </div>
        {onOpenContribute ? (
          <Button
            label="Contribute"
            variant="active"
            size="md"
            className="!w-auto shrink-0"
            onClick={onOpenContribute}
          />
        ) : (
          <Badge label={fundingStatusLabel.replaceAll('_', ' ')} tone={statusTone} dot={false} />
        )}
      </div>

      {showContributedProgress ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">{contributedLabel}</p>
          <div className="h-2 overflow-hidden rounded-full bg-hairline">
            <div className="h-full bg-active" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="flex flex-row items-center justify-between gap-2">
            <p className="text-xs text-muted">
              Min. target {minTargetLabel}
              {minTargetMet ? ' · reached' : ''}
            </p>
            {onOpenInvite ? (
              <button
                type="button"
                onClick={onOpenInvite}
                className="shrink-0 text-sm font-semibold text-active active:opacity-90"
              >
                Invite
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {budgetBreakdown ? (
        <ProjectBudgetBreakdown
          currency={currency}
          paidOutKobo={budgetBreakdown.paidOutKobo}
          reservedKobo={budgetBreakdown.reservedKobo}
          availableKobo={budgetBreakdown.availableKobo}
        />
      ) : null}

      <div className="h-px bg-hairline" />

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-row items-center gap-1.5">
            <IonIcon icon={ionIcons['time-outline']} size={14} color={colors.subtle} />
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Deadline</p>
          </div>
          <p className="text-base font-semibold break-words text-ink">{whenLabel}</p>
        </div>
        <div className="w-px self-stretch bg-hairline" />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-row items-center gap-1.5">
            <IonIcon icon={ionIcons['navigate-outline']} size={14} color={colors.subtle} />
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Location</p>
          </div>
          <p className="text-base font-semibold break-words text-ink">{locationLabel}</p>
        </div>
      </div>
    </div>
  );
}