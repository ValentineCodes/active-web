import { Pressable, Text, View } from 'react-native';

import type { SearchProjectRow } from '@/features/search/discovery-types';
import { formatMoney } from '@/lib/format';
import { MARKET } from '@/config';

function fundingStatusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

export function SearchProjectRowCard({
  project,
  onPress,
}: {
  project: SearchProjectRow;
  onPress: () => void;
}) {
  const budgetMajor =
    project.budget_total_kobo != null ? project.budget_total_kobo / 100 : null;
  const budgetLabel =
    budgetMajor != null ? formatMoney(budgetMajor, MARKET.currency) : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={project.title}
      className="rounded-2xl border border-hairline bg-elevated p-3 active:opacity-90"
    >
      <Text className="text-base font-semibold text-ink" numberOfLines={2}>
        {project.title}
      </Text>
      <View className="mt-1 gap-0.5">
        <Text className="text-sm capitalize text-muted">{fundingStatusLabel(project.funding_status)}</Text>
        {budgetLabel ? <Text className="text-sm font-medium text-ink">{budgetLabel}</Text> : null}
        {project.description ? (
          <Text className="text-sm text-muted" numberOfLines={2}>
            {project.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}