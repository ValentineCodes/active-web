import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { useTheme } from '@/theme';

type ActivityTabCardsProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
};

export function ActivityMyRequestCard({
  title,
  responseLine,
  amount,
  badge,
  onPress,
  disabled,
}: ActivityTabCardsProps & {
  responseLine: string;
  amount: string | null;
  badge: { label: string; tone: 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info' };
}) {
  const { shadow } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={shadow.card}
      className={cn(
        'gap-4 rounded-2xl border border-hairline bg-elevated p-4',
        !disabled && 'active:opacity-90',
      )}
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 font-serif text-xl font-bold leading-7 text-ink" numberOfLines={2}>
          {title}
        </Text>
        <Badge label={badge.label} tone={badge.tone} dot={false} />
      </View>

      <View className="flex-row items-end justify-between gap-3">
        <Text className="flex-1 text-sm text-muted">{responseLine}</Text>
        {amount ? (
          <Text className="text-lg font-bold text-active" numberOfLines={1}>
            {amount}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function ActivityMyResponseCard({
  title,
  metaLine,
  offerLine,
  badge,
  onPress,
  disabled,
}: ActivityTabCardsProps & {
  metaLine: string;
  offerLine: string | null;
  badge: { label: string; tone: 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info' };
}) {
  const { shadow } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={shadow.card}
      className={cn(
        'gap-2 rounded-2xl border border-hairline bg-elevated p-4',
        !disabled && 'active:opacity-90',
      )}
    >
      <Text className="font-serif text-xl font-bold leading-7 text-ink" numberOfLines={2}>
        {title}
      </Text>
      <Text className="text-sm text-muted" numberOfLines={1}>
        {metaLine}
      </Text>
      <View className="flex-row items-end justify-between gap-3 pt-1">
        {offerLine ? (
          <Text className="flex-1 text-base font-semibold text-active" numberOfLines={1}>
            {offerLine}
          </Text>
        ) : (
          <View className="flex-1" />
        )}
        <Badge label={badge.label} tone={badge.tone} dot={false} />
      </View>
    </Pressable>
  );
}

export function ActivityAttendingCard({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { shadow } = useTheme();
  return (
    <View className="gap-2">
      <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
        Attending now
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onPress}
        style={shadow.card}
        className="gap-1 rounded-2xl border border-active/30 bg-active/5 p-4 active:opacity-90"
      >
        <Text className="font-serif text-xl font-bold leading-7 text-ink" numberOfLines={2}>
          {title}
        </Text>
        <Text className="text-sm text-muted" numberOfLines={2}>
          {subtitle}
        </Text>
      </Pressable>
    </View>
  );
}
