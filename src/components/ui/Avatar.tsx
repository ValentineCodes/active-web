import { Text, View } from 'react-native';
import { Image } from 'expo-image';

import { useAvatarUrl } from '@/features/profile/api';
import { cn } from '@/lib/cn';

const SIZES = { sm: 'h-10 w-10', md: 'h-14 w-14', lg: 'h-24 w-24' } as const;
const TEXT_SIZES = { sm: 'text-base', md: 'text-xl', lg: 'text-3xl' } as const;

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
}: {
  path: string | null | undefined;
  name: string | null;
  size?: keyof typeof SIZES;
}) {
  const { data: url } = useAvatarUrl(path);

  return (
    <View
      className={cn(
        'items-center justify-center overflow-hidden rounded-full bg-surface',
        SIZES[size],
      )}
      accessibilityLabel={name ? `${name}'s profile picture` : 'Profile picture'}
    >
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : (
        <Text className={cn('font-semibold text-muted', TEXT_SIZES[size])}>{initials(name)}</Text>
      )}
    </View>
  );
}
