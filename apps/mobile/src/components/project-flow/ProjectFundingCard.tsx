import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme';

type ProjectFundingCardProps = {
  budgetLabel: string;
  contributedLabel: string;
  progressPct: number;
  minTargetLabel: string;
  minTargetMet: boolean;
  whenLabel: string;
  locationLabel: string;
  fundingStatusLabel: string;
  onOpenContribute?: () => void;
};

/** Budget / progress / when–location block — mirrors RequestOfferWhenCard for projects. */
export function ProjectFundingCard({
  budgetLabel,
  contributedLabel,
  progressPct,
  minTargetLabel,
  minTargetMet,
  whenLabel,
  locationLabel,
  fundingStatusLabel,
  onOpenContribute,
}: ProjectFundingCardProps) {
  const { colors, shadow } = useTheme();
  const statusTone =
    fundingStatusLabel === 'open' ? 'active' : fundingStatusLabel.includes('fund') ? 'brand' : 'neutral';
  const statusLabel = fundingStatusLabel.replaceAll('_', ' ');

  return (
    <View
      style={shadow.card}
      className="overflow-hidden rounded-2xl border border-hairline bg-elevated p-4"
    >
      <View className="gap-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
              Total budget
            </Text>
            <Text className="text-3xl font-bold text-active">{budgetLabel}</Text>
          </View>
          {onOpenContribute ? (
            <Button label="Contribute" variant="active" size="md" onPress={onOpenContribute} />
          ) : (
            <Badge label={statusLabel} tone={statusTone} dot={false} />
          )}
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-ink">{contributedLabel} raised</Text>
          <View className="h-2 overflow-hidden rounded-full bg-hairline">
            <View className="h-full bg-active" style={{ width: `${progressPct}%` }} />
          </View>
          <Text className="text-xs text-muted">
            Min. target {minTargetLabel}
            {minTargetMet ? ' · reached' : ''}
          </Text>
        </View>

        <View className="h-px bg-hairline" />

        <View className="flex-row items-start gap-3">
          <View className="min-w-0 flex-1 gap-1 pr-1">
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="time-outline" size={14} color={colors.subtle} />
              <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">When</Text>
            </View>
            <Text className="text-base font-semibold text-ink">{whenLabel}</Text>
          </View>
          <View className="w-px self-stretch bg-hairline" />
          <View className="min-w-0 flex-1 gap-1 pl-1">
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="navigate-outline" size={14} color={colors.subtle} />
              <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
                Location
              </Text>
            </View>
            <Text className="text-base font-semibold text-ink">{locationLabel}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}