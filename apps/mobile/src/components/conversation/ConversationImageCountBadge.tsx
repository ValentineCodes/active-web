import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';

export function ConversationImageCountBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count < 2) return null;

  return (
    <View
      className={cn(
        'flex-row items-center gap-1 rounded-full border border-white/25 bg-black/50 px-2 py-1',
        className,
      )}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name="images-outline" size={13} color="#fff" />
      <Text className="text-xs font-semibold leading-none text-white">{count}</Text>
    </View>
  );
}