import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface',
  brand: 'bg-brand-soft',
  active: 'bg-active-soft',
  danger: 'bg-danger-soft',
  warning: 'bg-warning-soft',
};

const labels: Record<Tone, string> = {
  neutral: 'text-muted',
  brand: 'text-brand',
  active: 'text-active',
  danger: 'text-danger',
  warning: 'text-warning',
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <View className={cn('self-start rounded-full px-3 py-1', tones[tone])}>
      <Text className={cn('text-xs font-semibold uppercase', labels[tone])}>{label}</Text>
    </View>
  );
}
