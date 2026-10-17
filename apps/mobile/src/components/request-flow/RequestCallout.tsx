import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';

const tones = {
  info: 'border-info/30 bg-info-soft',
  active: 'border-active/30 bg-active-soft',
  warning: 'border-warning/30 bg-warning-soft',
  danger: 'border-danger/30 bg-danger-soft',
  success: 'border-brand/30 bg-brand-soft',
};

const titleTones = {
  info: 'text-info',
  active: 'text-active',
  warning: 'text-warning',
  danger: 'text-danger',
  success: 'text-brand',
};

export function RequestCallout({
  tone,
  title,
  children,
}: {
  tone: keyof typeof tones;
  title: string;
  children?: ReactNode;
}) {
  return (
    <View className={cn('gap-2 rounded-2xl border p-4', tones[tone])}>
      <Text className={cn('text-sm font-bold uppercase tracking-wide', titleTones[tone])}>
        {title}
      </Text>
      {children}
    </View>
  );
}
