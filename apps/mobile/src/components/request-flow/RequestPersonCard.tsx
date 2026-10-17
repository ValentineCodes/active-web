import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { PreHandshakeDiscussButton } from '@/components/PreHandshakeDiscussButton';
import { PersonRow } from '@/components/ui/PersonRow';
import { useTheme } from '@/theme';

export function RequestPersonCard({
  avatarPath,
  name,
  ratingAverage,
  ratingCount,
  completionPercent,
  onPress,
  onDiscussPress,
  discussLoading,
}: {
  avatarPath: string | null | undefined;
  name: string | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  completionPercent?: number | null;
  onPress?: () => void;
  onDiscussPress?: () => void;
  discussLoading?: boolean;
}) {
  const { colors, shadow } = useTheme();
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
        trailing={
          <View className="flex-row items-center gap-1">
            {onDiscussPress ? (
              <PreHandshakeDiscussButton
                compact
                onPress={onDiscussPress}
                loading={discussLoading}
              />
            ) : null}
            <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
          </View>
        }
      />
    </View>
  );
}
