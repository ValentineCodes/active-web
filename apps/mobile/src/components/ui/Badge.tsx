import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface',
  brand: 'bg-brand-soft',
  active: 'bg-active-soft',
  danger: 'bg-danger-soft',
  warning: 'bg-warning-soft',
  info: 'bg-info-soft',
};

const labels: Record<Tone, string> = {
  neutral: 'text-muted',
  brand: 'text-brand',
  active: 'text-active',
  danger: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
};

const dots: Record<Tone, string> = {
  neutral: 'bg-subtle',
  brand: 'bg-brand',
  active: 'bg-active',
  danger: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
};

/**
 * The one small status label used everywhere a request, response or availability window
 * needs a state at a glance. A soft tinted pill with a matching dot reads clearly without
 * shouting — it should never be the loudest thing on a card.
 */
export function Badge({
  label,
  tone = 'neutral',
  dot = true,
}: {
  label: string;
  tone?: Tone;
  dot?: boolean;
}) {
  return (
    <View
      className={cn('flex-row items-center gap-1.5 self-start rounded-full px-3 py-1', tones[tone])}
    >
      {dot ? <View className={cn('h-1.5 w-1.5 rounded-full', dots[tone])} /> : null}
      <Text className={cn('text-xs font-semibold', labels[tone])}>{label}</Text>
    </View>
  );
}
