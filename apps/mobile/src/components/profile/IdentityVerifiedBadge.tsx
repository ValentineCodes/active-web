import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useColors } from '@/theme';

type Props = {
  /** Icon size in px; default matches body text beside names. */
  size?: number;
};

export function IdentityVerifiedBadge({ size = 18 }: Props) {
  const colors = useColors();

  return (
    <View accessibilityLabel="Identity verified" accessibilityRole="image" className="shrink-0">
      <Ionicons name="checkmark-circle" size={size} color={colors.active} />
    </View>
  );
}
