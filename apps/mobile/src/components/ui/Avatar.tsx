import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { useAvatarUrl } from '@/features/profile/api';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme';

const SIZES = { sm: 40, md: 56, lg: 96 } as const;
const TEXT_SIZES = { sm: 'text-base', md: 'text-xl', lg: 'text-3xl' } as const;
const DOT_SIZES = { sm: 10, md: 14, lg: 20 } as const;

function initials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function Avatar({
  path,
  name,
  size = 'md',
  /** A small dot in the mockup's brand green, signalling this person is Active right now. */
  showActiveDot = false,
  /** Marketplace identity verified (e.g. NIN submitted for this app flow). */
  verified = false,
  onPress,
}: {
  path: string | null | undefined;
  name: string | null;
  size?: keyof typeof SIZES;
  showActiveDot?: boolean;
  verified?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  const { data: url } = useAvatarUrl(path);
  const dimension = SIZES[size];
  const badgeSize = Math.max(14, Math.round(dimension * 0.32));

  const pictureLabel = name ? `${name}'s profile picture` : 'Profile picture';
  const shellClassName = 'relative';

  const content = (
    <>
      <View
        className="items-center justify-center overflow-hidden rounded-full bg-surface"
        style={{ width: dimension, height: dimension }}
        accessibilityLabel={onPress ? undefined : pictureLabel}
      >
        {url ? (
          <Image
            source={{ uri: url }}
            style={{ width: dimension, height: dimension, borderRadius: dimension / 2 }}
            contentFit="cover"
          />
        ) : (
          <Text className={cn('font-semibold text-muted', TEXT_SIZES[size])}>{initials(name)}</Text>
        )}
      </View>

      {showActiveDot ? (
        <View
          className="absolute bottom-0 right-0 rounded-full border-2 border-canvas bg-active"
          style={{ width: DOT_SIZES[size], height: DOT_SIZES[size] }}
        />
      ) : null}
      {verified && !showActiveDot ? (
        <View
          className="absolute bottom-0 right-0 items-center justify-center rounded-full border-2 border-canvas bg-canvas"
          style={{ width: badgeSize, height: badgeSize }}
        >
          <Ionicons name="checkmark-circle" size={badgeSize - 2} color={colors.active} />
        </View>
      ) : null}
    </>
  );

  if (onPress && path) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`View ${pictureLabel}`}
        className={cn(shellClassName, 'active:opacity-90')}
      >
        {content}
      </Pressable>
    );
  }

  return <View className={shellClassName}>{content}</View>;
}
