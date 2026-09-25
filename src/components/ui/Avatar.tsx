import { Text, View } from 'react-native';
import { Image } from 'expo-image';

import { useAvatarUrl } from '@/features/profile/api';
import { cn } from '@/lib/cn';

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
}: {
  path: string | null | undefined;
  name: string | null;
  size?: keyof typeof SIZES;
  showActiveDot?: boolean;
}) {
  const { data: url } = useAvatarUrl(path);
  const dimension = SIZES[size];

  return (
    <View className="relative">
      <View
        className="items-center justify-center overflow-hidden rounded-full bg-surface"
        style={{ width: dimension, height: dimension }}
        accessibilityLabel={name ? `${name}'s profile picture` : 'Profile picture'}
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
    </View>
  );
}
