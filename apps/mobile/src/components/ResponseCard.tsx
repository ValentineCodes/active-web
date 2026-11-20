import { Text, View } from 'react-native';

import { ResponderScheduleAvailability } from '@/components/ResponderScheduleAvailability';
import { MilestonePlanCard } from '@/components/request-flow/MilestonePlanCard';
import { RequestPersonCard } from '@/components/request-flow/RequestPersonCard';
import { Badge } from '@/components/ui/Badge';
import type { MilestoneProposalItem } from '@/features/requests/milestones';
import { formatDeliveryInstantLabel } from '@/features/requests/engagement-lifecycle';
import { formatAgo, formatMoney } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * Someone's response to a request, as the requester sees it before they choose.
 */
export function ResponseCard({
  displayName,
  avatarPath,
  ratingAverage,
  ratingCount,
  completionPercent,
  identityVerified = false,
  onViewProfile,
  message,
  quotedAmount,
  currency,
  createdAt,
  responderAvailable,
  onDiscussPress,
  discussLoading,
  statusLabel,
  statusTone,
  proposedMilestones,
  proposedMilestoneTotalMajor,
  proposedDeliveryAt,
  proposedDeliveryTimezone,
}: {
  displayName: string | null;
  avatarPath: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  completionPercent: number | null;
  identityVerified?: boolean;
  onViewProfile: () => void;
  message: string | null;
  quotedAmount: number | null;
  currency: string;
  createdAt: string;
  responderAvailable: boolean;
  onDiscussPress?: () => void;
  discussLoading?: boolean;
  statusLabel?: string;
  statusTone?: 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';
  proposedMilestones?: MilestoneProposalItem[];
  proposedMilestoneTotalMajor?: number;
  proposedDeliveryAt?: string | null;
  proposedDeliveryTimezone?: string | null;
}) {
  const { shadow } = useTheme();
  const offerLabel = quotedAmount !== null ? formatMoney(quotedAmount, currency) : null;
  const proposedDeliveryLabel = formatDeliveryInstantLabel(
    proposedDeliveryAt,
    proposedDeliveryTimezone,
  );

  return (
    <View style={shadow.card} className="gap-4 rounded-2xl border border-hairline bg-elevated p-4">
      <View className="gap-2">
        {statusLabel ? <Badge label={statusLabel} tone={statusTone ?? 'neutral'} /> : null}
        <RequestPersonCard
          avatarPath={avatarPath}
          name={displayName}
          ratingAverage={ratingAverage}
          ratingCount={ratingCount}
          completionPercent={completionPercent}
          identityVerified={identityVerified}
          onPress={onViewProfile}
          onDiscussPress={onDiscussPress}
          discussLoading={discussLoading}
        />
      </View>

      {message || offerLabel || (proposedMilestones && proposedMilestones.length >= 2) ? (
        <View className="gap-2 rounded-2xl bg-surface p-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-sm text-muted">{formatAgo(createdAt)}</Text>
            {offerLabel ? (
              <Text className="text-base font-bold text-active">{offerLabel}</Text>
            ) : null}
          </View>
          {message ? <Text className="text-base leading-6 text-ink">{message}</Text> : null}
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
            <View className="gap-1 pt-1">
              <Text className="text-xs font-bold uppercase tracking-widest text-subtle">
                Proposed delivery
              </Text>
              <Text className="text-sm leading-5 text-ink">{proposedDeliveryLabel}</Text>
              <Text className="text-xs text-muted">
                Countdown begins when they press Start after you accept, not at this proposed time.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <ResponderScheduleAvailability available={responderAvailable} />
    </View>
  );
}
