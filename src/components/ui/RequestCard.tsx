import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { colors, shadow } from '@/theme';

type Tone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';

/**
 * Summary tile for a request — title, optional preview, when/proximity, offer, and status.
 */
export function RequestCard({
  title,
  description,
  badge,
  when,
  proximity,
  meta = [],
  amount,
  onPress,
  disabled = false,
  footer,
}: {
  title: string;
  description?: string;
  badge?: { label: string; tone: Tone };
  when?: string | null;
  proximity?: string | null;
  /** Extra lines below when/proximity (e.g. area label, history note). */
  meta?: string[];
  amount?: string | null;
  onPress: () => void;
  disabled?: boolean;
  footer?: ReactNode;
}) {
  type DetailLine = {
    icon: 'time-outline' | 'navigate-outline' | 'location-outline';
    text: string;
  };

  const detailLines: DetailLine[] = [];
  if (when) detailLines.push({ icon: 'time-outline', text: when });
  if (proximity) detailLines.push({ icon: 'navigate-outline', text: proximity });
  for (const text of meta) {
    if (text) detailLines.push({ icon: 'location-outline', text });
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${badge ? `, ${badge.label}` : ''}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={shadow.card}
      className={cn(
        'gap-3 rounded-2xl border border-hairline bg-canvas p-4',
        !disabled && 'active:opacity-90',
      )}
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-lg font-bold text-ink" numberOfLines={2}>
          {title}
        </Text>
        {badge ? <Badge label={badge.label} tone={badge.tone} dot={false} /> : null}
      </View>

      {description ? (
        <Text className="text-sm leading-5 text-muted" numberOfLines={3}>
          {description}
        </Text>
      ) : null}

      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-1 gap-2">
          {detailLines.map((line) => (
            <View key={line.text} className="flex-row items-center gap-2">
              <Ionicons name={line.icon} size={14} color={colors.subtle} />
              <Text className="flex-1 text-sm text-muted" numberOfLines={1}>
                {line.text}
              </Text>
            </View>
          ))}
        </View>
        {amount ? (
          <Text className="text-xl font-bold text-ink" numberOfLines={1}>
            {amount}
          </Text>
        ) : null}
      </View>

      {footer}
    </Pressable>
  );
}
