'use client';

import { ResponderScheduleAvailability } from '@/components/ResponderScheduleAvailability';
import { MilestonePlanCard } from '@/components/request-flow/MilestonePlanCard';
import { RequestPersonCard } from '@/components/request-flow/RequestPersonCard';
import { Badge } from '@/components/ui/Badge';
import type { MilestoneProposalItem } from '@/features/requests/milestones';
import {
  type DeliveryDurationUnit,
  proposedDeliveryLabelFromRow,
} from '@/features/requests/delivery-duration';
import { formatDeliveryInstantLabel } from '@/features/requests/engagement-lifecycle';
import { formatAgo, formatMoney } from '@/lib/format';

type BadgeTone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';

export function ResponseCard({
  displayName,
  avatarPath,
  ratingAverage,
  ratingCount,
  completionPercent,
  onViewProfile,
  message,
  quotedAmount,
  currency,
  createdAt,
  responderAvailable,
  onDiscussPress,
  discussLoading,
  onOpenDetail,
  statusLabel,
  statusTone,
  proposedMilestones,
  proposedMilestoneTotalMajor,
  proposedDeliveryDurationValue,
  proposedDeliveryDurationUnit,
  proposedDeliveryAt,
  proposedDeliveryTimezone,
}: {
  displayName: string | null;
  avatarPath: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  completionPercent: number | null;
  onViewProfile: () => void;
  message: string | null;
  quotedAmount: number | null;
  currency: string;
  createdAt: string;
  responderAvailable: boolean;
  onDiscussPress?: () => void;
  discussLoading?: boolean;
  onOpenDetail?: () => void;
  statusLabel?: string;
  statusTone?: BadgeTone;
  proposedMilestones?: MilestoneProposalItem[];
  proposedMilestoneTotalMajor?: number;
  proposedDeliveryDurationValue?: number | null;
  proposedDeliveryDurationUnit?: DeliveryDurationUnit | null;
  proposedDeliveryAt?: string | null;
  proposedDeliveryTimezone?: string | null;
}) {
  const offerLabel = quotedAmount !== null ? formatMoney(quotedAmount, currency) : null;
  const proposedDeliveryLabel = proposedDeliveryLabelFromRow({
    proposed_delivery_duration_value: proposedDeliveryDurationValue ?? null,
    proposed_delivery_duration_unit: proposedDeliveryDurationUnit ?? null,
    proposed_delivery_at: proposedDeliveryAt ?? null,
    proposed_delivery_timezone: proposedDeliveryTimezone ?? null,
    formatCalendar: formatDeliveryInstantLabel,
  });

  return (
    <article className="shadow-card flex flex-col gap-4 rounded-2xl border border-hairline bg-elevated p-4">
      <div className="flex flex-col gap-2">
        {statusLabel ? <Badge label={statusLabel} tone={statusTone ?? 'neutral'} /> : null}
        <RequestPersonCard
          avatarPath={avatarPath}
          name={displayName}
          ratingAverage={ratingAverage}
          ratingCount={ratingCount}
          completionPercent={completionPercent}
          onPress={onViewProfile}
          onDiscussPress={onDiscussPress}
          discussLoading={discussLoading}
        />
      </div>

      {message ||
      offerLabel ||
      proposedDeliveryLabel ||
      (proposedMilestones && proposedMilestones.length >= 2) ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-surface p-3">
          <div className="flex flex-row items-center justify-between gap-2">
            <p className="text-sm text-muted">{formatAgo(createdAt)}</p>
            {offerLabel ? <p className="text-base font-bold text-active">{offerLabel}</p> : null}
          </div>
          {message ? <p className="text-base leading-6 text-ink">{message}</p> : null}
          {proposedMilestones && proposedMilestones.length >= 2 && proposedMilestoneTotalMajor != null ? (
            <MilestonePlanCard
              paymentStructure="milestone"
              totalMajor={proposedMilestoneTotalMajor}
              milestones={proposedMilestones}
              currency={currency}
              heading="Their proposed plan"
              variant="proposed"
            />
          ) : null}
          {proposedDeliveryLabel ? (
            <div className="flex flex-col gap-1 pt-1">
              <p className="text-xs font-bold uppercase tracking-widest text-subtle">
                Proposed delivery
              </p>
              <p className="text-sm leading-5 text-ink">{proposedDeliveryLabel}</p>
              <p className="text-xs text-muted">
                Countdown begins when they press Start after you accept.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <ResponderScheduleAvailability available={responderAvailable} />

      {onOpenDetail ? (
        <button
          type="button"
          className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 text-left text-sm font-semibold text-ink active:opacity-90"
          onClick={onOpenDetail}
        >
          View assignment
        </button>
      ) : null}
    </article>
  );
}
