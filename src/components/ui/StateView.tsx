import { ActivityIndicator, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { toUserMessage } from '@/lib/supabase/errors';
import { useColors } from '@/theme';

/** Centred loading placeholder for a whole screen or list. */
export function LoadingState({ label }: { label?: string }) {
  const colors = useColors();
  return (
    <View className="flex-1 items-center justify-center gap-3 p-8" accessibilityRole="progressbar">
      <ActivityIndicator color={colors.brand} />
      {label ? <Text className="text-base text-muted">{label}</Text> : null}
    </View>
  );
}

/** Nothing has gone wrong; there is simply nothing here yet. */
export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  const colors = useColors();
  return (
    <View className="flex-1 items-center justify-center gap-3 p-8">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-soft">
        <Ionicons name={icon} size={28} color={colors.brand} />
      </View>
      <Text className="text-center text-lg font-semibold text-ink">{title}</Text>
      <Text className="max-w-xs text-center text-base text-muted">{message}</Text>
      {action ? (
        <Button label={action.label} onPress={action.onPress} variant="primary" className="mt-2" />
      ) : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const colors = useColors();
  return (
    <View className="flex-1 items-center justify-center gap-3 p-8">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-danger-soft">
        <Ionicons name="alert-circle-outline" size={28} color={colors.danger} />
      </View>
      <Text className="text-center text-lg font-semibold text-ink">That didn&apos;t work</Text>
      <Text className="max-w-xs text-center text-base text-muted">{toUserMessage(error)}</Text>
      {onRetry ? (
        <Button label="Try again" onPress={onRetry} variant="secondary" className="mt-2" />
      ) : null}
    </View>
  );
}

/** Short confirmation after a successful action (submit, save, fund, etc.). */
export function SuccessBanner({ message }: { message: string }) {
  const colors = useColors();
  return (
    <View
      className="flex-row items-start gap-2 rounded-xl bg-active-soft p-3"
      accessibilityRole="text"
    >
      <Ionicons name="checkmark-circle" size={18} color={colors.active} />
      <Text className="flex-1 text-sm text-ink">{message}</Text>
    </View>
  );
}

/** Inline form/action error, shown next to the control that produced it. */
export function InlineError({ error }: { error: unknown }) {
  const colors = useColors();
  return (
    <View
      className="flex-row items-start gap-2 rounded-xl bg-danger-soft p-3"
      accessibilityRole="alert"
    >
      <Ionicons name="alert-circle" size={18} color={colors.danger} />
      <Text className="flex-1 text-sm text-danger">{toUserMessage(error)}</Text>
    </View>
  );
}
