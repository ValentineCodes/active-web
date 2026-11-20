import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';

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

/** Budget / progress / deadline block — mirrors RequestOfferWhenCard for projects. */
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
  const { colors, shadow } = useTheme();

  return (
    <View
      style={shadow.card}
      className="overflow-hidden rounded-2xl border border-hairline bg-elevated p-4"
    >
      <View className="gap-4">
        <View className="gap-1">
          <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
            Total budget
          </Text>
          <Text className="text-3xl font-bold text-active">{budgetLabel}</Text>
          <Text className="text-sm font-semibold text-ink">{contributedLabel} raised so far</Text>
        </View>

        <View className="h-2 overflow-hidden rounded-full bg-hairline">
          <View className="h-full bg-active" style={{ width: `${progressPct}%` }} />
        </View>

        <View className="h-px bg-hairline" />

        <View className="flex-row">
          <View className="flex-1 gap-1 pr-3">
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="time-outline" size={14} color={colors.subtle} />
              <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
                Deadline
              </Text>
            </View>
            <Text className="text-base font-semibold text-ink">{deadlineDetail}</Text>
            <Text className="text-xs text-muted">{deadlineLabel}</Text>
          </View>
          <View className="w-px bg-hairline" />
          <View className="flex-1 gap-1 pl-3">
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="wallet-outline" size={14} color={colors.subtle} />
              <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
                Funding
              </Text>
            </View>
            <Text className="text-base font-semibold capitalize text-ink">{fundingStatusLabel}</Text>
            <Text className="text-xs text-muted">
              Min. target {minTargetLabel}
              {minTargetMet ? ' · reached' : ''}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}