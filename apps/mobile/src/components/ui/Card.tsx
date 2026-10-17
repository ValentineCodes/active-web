import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { cn } from '@/lib/cn';
import { useTheme } from '@/theme';

type Tone = 'surface' | 'brand' | 'active' | 'warning' | 'danger';

const toneClasses: Record<Tone, string> = {
  surface: 'bg-canvas',
  brand: 'bg-brand-soft',
  active: 'bg-active-soft',
  warning: 'bg-warning-soft',
  danger: 'bg-danger-soft',
};

/**
 * The one elevated container used across the app: a request summary, a status banner, a
 * warning notice. `surface` cards lift off the canvas with a soft shadow; tinted tones are
 * flat fills that already read as distinct without needing a shadow on top. Deliberately
 * borderless — colour and elevation carry the hierarchy instead of hairlines everywhere.
 */
export function Card({
  tone = 'surface',
  className,
  children,
  ...viewProps
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
} & ViewProps) {
  const { shadow } = useTheme();
  return (
    <View
      className={cn('gap-3 rounded-3xl p-5', toneClasses[tone], className)}
      style={tone === 'surface' ? shadow.card : undefined}
      {...viewProps}
    >
      {children}
    </View>
  );
}
