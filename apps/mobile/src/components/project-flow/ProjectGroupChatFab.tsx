import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

export function ProjectGroupChatFab({
  onPress,
  unreadCount = 0,
  accessibilityLabel = 'Open project team chat',
}: {
  onPress: () => void;
  unreadCount?: number;
  accessibilityLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const { colors, shadow } = useTheme();
  const bottom = Math.max(20, insets.bottom + 16);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[{ position: 'absolute', right: 20, bottom }, shadow.raised]}
      className="z-40 h-14 w-14 items-center justify-center rounded-full border border-hairline bg-active active:opacity-90"
    >
      <Ionicons name="chatbubble-outline" size={26} color={colors.onBrand} />
      {unreadCount > 0 ? (
        <View
          aria-hidden
          className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-active bg-danger"
        />
      ) : null}
    </Pressable>
  );
}