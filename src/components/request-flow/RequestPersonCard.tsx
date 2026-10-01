import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { PersonRow } from '@/components/ui/PersonRow';
import { colors, shadow } from '@/theme';

export function RequestPersonCard({
  avatarPath,
  name,
  ratingAverage,
  ratingCount,
  completionPercent,
  onPress,
}: {
  avatarPath: string | null | undefined;
  name: string | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  completionPercent?: number | null;
  onPress?: () => void;
}) {
  const inlineStat = completionPercent != null ? `${completionPercent}% completion` : undefined;

  return (
    <View
      style={shadow.card}
      className="overflow-hidden rounded-2xl border border-hairline bg-elevated p-4"
    >
      <PersonRow
        avatarPath={avatarPath}
        name={name}
        ratingAverage={ratingAverage}
        ratingCount={ratingCount}
        inlineStat={inlineStat}
        onPress={onPress}
        trailing={<Ionicons name="chevron-forward" size={18} color={colors.subtle} />}
      />
    </View>
  );
}
