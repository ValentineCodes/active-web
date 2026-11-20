'use client';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';

type ProjectFundingCardProps = {
  budgetLabel: string;
  contributedLabel: string;
  deadlineLabel: string;
  deadlineDetail: string;
  fundingStatusLabel: string;
  progressPct: number;
  minTargetLabel: string;
  minTargetMet: boolean;
};

export function ProjectFundingCard({
  budgetLabel,
  contributedLabel,
  deadlineLabel,
  deadlineDetail,
  fundingStatusLabel,
  progressPct,
  minTargetLabel,
  minTargetMet,
}: ProjectFundingCardProps) {
  return (
    <div className="shadow-card flex flex-col gap-4 overflow-hidden rounded-2xl border border-hairline bg-elevated p-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Total budget</p>
        <p className="text-3xl font-bold text-active">{budgetLabel}</p>
        <p className="text-sm font-semibold text-ink">{contributedLabel} raised so far</p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-hairline">
        <div className="h-full bg-active" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="h-px bg-hairline" />

      <div className="flex flex-row">
        <div className="flex flex-1 flex-col gap-1 pr-3">
          <div className="flex flex-row items-center gap-1.5">
            <IonIcon icon={ionIcons['time-outline']} size={14} className="text-subtle" />
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Deadline</p>
          </div>
          <p className="text-base font-semibold text-ink">{deadlineDetail}</p>
          <p className="text-xs text-muted">{deadlineLabel}</p>
        </div>
        <div className="w-px bg-hairline" />
        <div className="flex flex-1 flex-col gap-1 pl-3">
          <div className="flex flex-row items-center gap-1.5">
            <IonIcon icon={ionIcons['wallet-outline']} size={14} className="text-subtle" />
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Funding</p>
          </div>
          <p className="text-base font-semibold capitalize text-ink">{fundingStatusLabel}</p>
          <p className="text-xs text-muted">
            Min. target {minTargetLabel}
            {minTargetMet ? ' · reached' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}