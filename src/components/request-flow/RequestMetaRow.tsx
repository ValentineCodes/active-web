import { Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';

export function RequestMetaRow({
  badgeLabel,
  badgeTone,
  trailing,
}: {
  badgeLabel: string;
  badgeTone: 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';
  trailing: string;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Badge label={badgeLabel} tone={badgeTone} dot={false} />
      <Text className="text-sm text-muted">{trailing}</Text>
    </View>
  );
}
