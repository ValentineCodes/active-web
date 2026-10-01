import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';
import { useTheme } from '@/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

function ConnectionAction({
  label,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  icon: IoniconName;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors, shadow } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={shadow.card}
      className={cn(
        'flex-1 items-center gap-2.5 rounded-2xl border border-hairline bg-elevated py-4',
        disabled && 'opacity-40',
      )}
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-active-soft">
        <Ionicons name={icon} size={22} color={colors.active} />
      </View>
      <Text className="text-sm font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}

export function RequestConnectionActions({
  onChat,
  onCall,
  onViewMap,
  chatDisabled,
  callDisabled,
}: {
  onChat: () => void;
  onCall: () => void;
  onViewMap: () => void;
  chatDisabled?: boolean;
  callDisabled?: boolean;
}) {
  return (
    <View className="flex-row gap-3">
      <ConnectionAction
        label="Chat"
        icon="chatbubble-outline"
        onPress={onChat}
        disabled={chatDisabled}
      />
      <ConnectionAction label="Call" icon="call-outline" onPress={onCall} disabled={callDisabled} />
      <ConnectionAction label="View map" icon="location-outline" onPress={onViewMap} />
    </View>
  );
}
