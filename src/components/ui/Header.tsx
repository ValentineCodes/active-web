import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { IconButton } from '@/components/ui/IconButton';

/**
 * The one top bar shape used by every pushed and modal screen. Flat — no dividing
 * hairline — so it reads as part of the page rather than chrome bolted on top of it.
 */
export function Header({
  title,
  onBack,
  onClose,
  right,
}: {
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  right?: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-2 px-4 py-3">
      {onBack ? (
        <IconButton icon="chevron-back" accessibilityLabel="Go back" onPress={onBack} />
      ) : null}
      <Text
        className="flex-1 text-xl font-bold text-ink"
        numberOfLines={1}
        style={!onBack ? { marginLeft: 4 } : undefined}
      >
        {title}
      </Text>
      {right}
      {onClose ? <IconButton icon="close" accessibilityLabel="Close" onPress={onClose} /> : null}
    </View>
  );
}
