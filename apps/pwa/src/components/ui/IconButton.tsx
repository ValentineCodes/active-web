import { cn } from '@/lib/cn';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons, type IonIconName } from '@/components/ui/ion-icons';

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
  const glyph = ionIcons[icon];
  const ink = variant === 'brand' ? '#166A3D' : '#111812';

  return (
    <button
      type="button"
      aria-label={accessibilityLabel}
      onClick={onClick}
      style={{ width: size, height: size }}
      className={cn(
        'inline-flex items-center justify-center rounded-full active:opacity-70',
        containers[variant],
      )}
    >
      <IonIcon icon={glyph} size={Math.round(size * 0.55)} color={ink} />
    </button>
  );
}
