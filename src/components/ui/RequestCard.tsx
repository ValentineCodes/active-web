import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { colors, shadow } from '@/theme';

type Tone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';

/**
 * The one summary tile for "a request" — used for a requester's own request (Home,
 * Requests) and, with a different meta line, a provider's nearby inbox row (Activity).
 * Keeping this in one place is what makes every list of requests in the app feel like
 * the same product.
 */
export function RequestCard({
  icon = 'ellipse-outline',
  title,
  description,
  badge,
  meta,
  amount,
  onPress,
  disabled = false,
  footer,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  badge?: { label: string; tone: Tone };
  meta: string[];
  amount?: string | null;
  onPress: () => void;
  disabled?: boolean;
  footer?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${badge ? `, ${badge.label}` : ''}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={shadow.card}
      className={cn('gap-3 rounded-3xl bg-canvas p-4', !disabled && 'active:opacity-80')}
    >
      <View className="flex-row items-start gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-soft">
          <Ionicons name={icon} size={20} color={colors.brand} />
        </View>

        <View className="flex-1 gap-1">
          <View className="flex-row items-start justify-between gap-2">
            <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={2}>
              {title}
            </Text>
            {amount ? <Text className="text-base font-bold text-ink">{amount}</Text> : null}
          </View>
          {description ? (
            <Text className="text-sm text-muted" numberOfLines={2}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="flex-row flex-wrap items-center justify-between gap-2 pl-14">
        <View className="flex-1 flex-row flex-wrap gap-x-3 gap-y-1">
          {meta.map((line) => (
            <Text key={line} className="text-xs text-subtle">
              {line}
            </Text>
          ))}
        </View>
        {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
      </View>

      {footer}
    </Pressable>
  );
}
