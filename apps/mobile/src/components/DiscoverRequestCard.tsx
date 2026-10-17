import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { useTheme } from '@/theme';

type Tone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';

type DiscoverRequestCardProps = {
  title: string;
  description: string;
  amount: string;
  whenLine: string;
  proximity: string;
  badge?: { label: string; tone: Tone };
  onOpen: () => void;
  onHelp: () => void;
  helpLabel?: string;
  disabled?: boolean;
};

/** Discovery list tile — what they need, offer, when, rough distance, and a clear help CTA. */
export function DiscoverRequestCard({
  title,
  description,
  amount,
  whenLine,
  proximity,
  badge,
  onOpen,
  onHelp,
  helpLabel = 'I can help',
  disabled = false,
}: DiscoverRequestCardProps) {
  const { shadow } = useTheme();
  return (
    <View
      style={shadow.card}
      className={cn(
        'gap-4 rounded-2xl border border-hairline bg-canvas p-4',
        disabled && 'opacity-60',
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        disabled={disabled}
        onPress={onOpen}
        className={cn('gap-2', !disabled && 'active:opacity-90')}
      >
        <View className="flex-row items-start justify-between gap-3">
          <Text
            className="flex-1 text-base font-bold uppercase tracking-wide text-ink"
            numberOfLines={1}
          >
            {title}
          </Text>
          {badge ? <Badge label={badge.label} tone={badge.tone} dot={false} /> : null}
        </View>

        <Text className="text-sm leading-5 text-muted" numberOfLines={2}>
          &ldquo;{description}&rdquo;
        </Text>

        <Text className="text-2xl font-bold text-ink">{amount}</Text>

        <Text className="text-sm text-muted">
          {whenLine}
          {' · '}
          {proximity}
        </Text>
      </Pressable>

      <Button label={helpLabel} size="lg" disabled={disabled} onPress={onHelp} />
    </View>
  );
}

export function DiscoverRequestCardSkeleton() {
  const { shadow } = useTheme();
  return (
    <View
      style={shadow.card}
      className="gap-4 rounded-2xl border border-hairline bg-canvas p-4"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className="gap-2">
        <SkeletonBlock className="h-5 w-3/5 rounded-md" />
        <SkeletonBlock className="h-10 w-full rounded-md" />
        <SkeletonBlock className="h-8 w-28 rounded-md" />
        <SkeletonBlock className="h-4 w-40 rounded-md" />
      </View>
      <SkeletonBlock className="h-12 w-full rounded-2xl" />
    </View>
  );
}
