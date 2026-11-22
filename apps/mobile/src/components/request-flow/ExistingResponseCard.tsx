import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { MilestonePlanCard } from '@/components/request-flow/MilestonePlanCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { MilestoneProposalItem } from '@/features/requests/milestones';
import {
  type DeliveryDurationUnit,
  proposedDeliveryLabelFromRow,
} from '@/features/requests/delivery-duration';
import { formatDeliveryInstantLabel } from '@/features/requests/engagement-lifecycle';
import { formatMoney } from '@/lib/format';
import { useColors } from '@/theme';

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
  const offerLabel = quotedAmount !== null ? formatMoney(quotedAmount, currency) : '—';
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
    <View className="overflow-hidden rounded-3xl border border-hairline bg-elevated">
      {compactPendingStatus ? null : (
        <View className="flex-row items-start gap-3 border-b border-hairline bg-warning-soft px-5 py-4">
          <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-full bg-warning/15">
            <Ionicons name="time-outline" size={20} color={colors.warning} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-xs font-semibold uppercase tracking-wide text-warning">
              {pendingStatusLabel}
            </Text>
            <Text className="mt-1 text-sm leading-5 text-muted">
              The requester can accept your offer or keep looking. You are not committed until they
              choose you.
            </Text>
          </View>
        </View>
      )}

      <View className="gap-5 px-5 py-5">
        {compactPendingStatus ? <Badge label={pendingStatusLabel} tone="warning" /> : null}
        <View className="flex-row items-end justify-between gap-4">
          <View>
            <Text className="text-xs font-medium text-subtle">Your offer</Text>
            <Text className="mt-1 text-3xl font-bold tracking-tight text-ink tabular-nums">
              {offerLabel}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-xs font-medium text-subtle">They offered</Text>
            <Text className="mt-1 text-base font-semibold text-muted tabular-nums">
              {requestLabel}
            </Text>
          </View>
        </View>

        {trimmedMessage ? (
          <View className="rounded-2xl border border-hairline bg-surface px-4 py-3">
            <Text className="text-xs font-medium text-subtle">Message</Text>
            <Text className="mt-1 text-sm leading-6 text-ink">{trimmedMessage}</Text>
          </View>
        ) : (
          <Text className="text-sm italic text-subtle">No message with your response.</Text>
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
          <View className="rounded-2xl border border-hairline bg-surface px-4 py-3">
            <Text className="text-xs font-medium text-subtle">Proposed delivery</Text>
            <Text className="mt-1 text-sm leading-6 text-ink">{proposedDeliveryLabel}</Text>
            <Text className="mt-2 text-xs text-muted">
              Countdown begins when you press Start after they accept, not at this proposed time.
            </Text>
          </View>
        ) : null}

        <View className="flex-row gap-3 pt-1">
          <Button
            label="Cancel"
            variant="danger"
            size="lg"
            corner="2xl"
            className="min-w-0 flex-1"
            onPress={onCancel}
            loading={cancelLoading}
          />
          <Button
            label="Edit"
            variant="secondary"
            size="lg"
            corner="2xl"
            className="min-w-0 flex-1"
            onPress={onEdit}
          />
        </View>
      </View>
    </View>
  );
}