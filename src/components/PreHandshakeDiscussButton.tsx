import { ActivityIndicator, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { cn } from '@/lib/cn';
import { useColors } from '@/theme';

export function PreHandshakeDiscussButton({
  onPress,
  loading = false,
  compact = false,
}: {
  onPress: () => void;
  loading?: boolean;
  compact?: boolean;
}) {
  const colors = useColors();
  const inert = loading;
  const size = compact ? 40 : 56;
  const iconSize = compact ? 20 : 24;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Discuss"
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      hitSlop={8}
      onPress={(event) => {
        event.stopPropagation();
        Haptics.selectionAsync();
        onPress();
      }}
      style={{ height: size, width: size, borderRadius: size / 2 }}
      className={cn(
        'items-center justify-center border border-hairline bg-active-soft active:opacity-80',
        inert && 'opacity-60',
      )}
    >
      {loading ? (
        <ActivityIndicator color={colors.active} />
      ) : (
        <Ionicons name="chatbubble-outline" size={iconSize} color={colors.active} />
      )}
    </Pressable>
  );
}
