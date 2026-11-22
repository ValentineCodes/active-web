'use client';

import { MilestonePlanCard } from '@/components/request-flow/MilestonePlanCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import type { MilestoneProposalItem } from '@/features/requests/milestones';
import {
  type DeliveryDurationUnit,
  proposedDeliveryLabelFromRow,
} from '@/features/requests/delivery-duration';
import { formatDeliveryInstantLabel } from '@/features/requests/engagement-lifecycle';
import { formatMoney } from '@/lib/format';
import { useColors } from '@/theme/ThemeProvider';

type Props = {
  currency: string;
  quotedAmount: number | null;
  requesterOffer: number | null;
  message: string | null;
  onEdit: () => void;
  onCancel: () => void;
  cancelLoading?: boolean;
  proposedMilestones?: MilestoneProposalItem[];
  proposedMilestoneTotalMajor?: number;
  proposedDeliveryDurationValue?: number | null;
  proposedDeliveryDurationUnit?: DeliveryDurationUnit | null;
  proposedDeliveryAt?: string | null;
  proposedDeliveryTimezone?: string | null;
  /** Project worker responses: badge only. Request respond keeps the explainer banner. */
  compactPendingStatus?: boolean;
  pendingStatusLabel?: string;
};

/** Pending response the helper already sent — offer preview and edit / withdraw actions. */
export function ExistingResponseCard({
  currency,
  quotedAmount,
  requesterOffer,
  message,
  onEdit,
  onCancel,
  cancelLoading,
  proposedMilestones,
  proposedMilestoneTotalMajor,
  proposedDeliveryDurationValue,
  proposedDeliveryDurationUnit,
  proposedDeliveryAt,
  proposedDeliveryTimezone,
  compactPendingStatus = false,
  pendingStatusLabel = 'Awaiting acceptance',
}: Props) {
  const colors = useColors();
  const offerLabel =
    quotedAmount !== null ? formatMoney(quotedAmount, currency) : '—';
  const requestLabel =
    requesterOffer !== null ? formatMoney(requesterOffer, currency) : '—';
  const trimmedMessage = message?.trim() ?? '';
  const proposedDeliveryLabel = proposedDeliveryLabelFromRow({
    proposed_delivery_duration_value: proposedDeliveryDurationValue ?? null,
    proposed_delivery_duration_unit: proposedDeliveryDurationUnit ?? null,
    proposed_delivery_at: proposedDeliveryAt ?? null,
    proposed_delivery_timezone: proposedDeliveryTimezone ?? null,
    formatCalendar: formatDeliveryInstantLabel,
  });

  return (
    <section className="shadow-card overflow-hidden rounded-3xl border border-hairline bg-elevated">
      {compactPendingStatus ? null : (
        <header className="flex flex-row items-start gap-3 border-b border-hairline bg-warning-soft px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/15">
            <IonIcon icon={ionIcons['time-outline']} size={20} color={colors.warning} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-warning">
              {pendingStatusLabel}
            </p>
            <p className="mt-1 text-sm leading-5 text-muted">
              The requester can accept your offer or keep looking. You are not committed until they
              choose you.
            </p>
          </div>
        </header>
      )}

      <div className="flex flex-col gap-5 px-5 py-5">
        {compactPendingStatus ? (
          <Badge label={pendingStatusLabel} tone="warning" />
        ) : null}
        <div className="flex flex-row items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-subtle">Your offer</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-ink tabular-nums">
              {offerLabel}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-subtle">They offered</p>
            <p className="mt-1 text-base font-semibold text-muted tabular-nums">{requestLabel}</p>
          </div>
        </div>

        {trimmedMessage ? (
          <div className="rounded-2xl border border-hairline bg-surface px-4 py-3">
            <p className="text-xs font-medium text-subtle">Message</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">{trimmedMessage}</p>
          </div>
        ) : (
          <p className="text-sm italic text-subtle">No message with your response.</p>
        )}

        {proposedMilestones && proposedMilestones.length >= 2 ? (
          <MilestonePlanCard
            paymentStructure="milestone"
            totalMajor={proposedMilestoneTotalMajor ?? requesterOffer ?? 0}
            milestones={proposedMilestones}
            currency={currency}
            heading="Your proposed milestones"
            variant="proposed"
          />
        ) : null}

        {proposedDeliveryLabel ? (
          <div className="rounded-2xl border border-hairline bg-surface px-4 py-3">
            <p className="text-xs font-medium text-subtle">Proposed delivery</p>
            <p className="mt-1 text-sm leading-6 text-ink">{proposedDeliveryLabel}</p>
          </div>
        ) : null}

        <div className="flex flex-row gap-3 pt-1">
          <Button
            label="Cancel"
            variant="danger"
            size="lg"
            corner="2xl"
            className="min-w-0 flex-1"
            onClick={onCancel}
            loading={cancelLoading}
          />
          <Button
            label="Edit"
            variant="secondary"
            size="lg"
            corner="2xl"
            className="min-w-0 flex-1"
            onClick={onEdit}
          />
        </div>
      </div>
    </section>
  );
}