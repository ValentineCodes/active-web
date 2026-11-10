'use client';

import { cn } from '@/lib/cn';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons, type IonIconName } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

const containers = {
  ghost: 'bg-transparent',
  surface: 'bg-surface',
  brand: 'bg-brand-soft',
} as const;

type Variant = keyof typeof containers;

export function IconButton({
  icon,
  onClick,
  accessibilityLabel,
  variant = 'ghost',
  size = 40,
}: {
  icon: IonIconName;
  onClick: () => void;
  accessibilityLabel: string;
  variant?: Variant;
  size?: number;
}) {
  const colors = useColors();
  const glyph = ionIcons[icon];
  const foregrounds: Record<Variant, string> = {
    ghost: colors.ink,
    surface: colors.ink,
    brand: colors.brand,
  };

  return (
    <button
      type="button"
      aria-label={accessibilityLabel}
      onClick={onClick}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className={cn('inline-flex items-center justify-center active:opacity-70', containers[variant])}
    >
      <IonIcon icon={glyph} size={Math.round(size * 0.55)} color={foregrounds[variant]} />
    </button>
  );
}
