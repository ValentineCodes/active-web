'use client';

import { lightPalette } from '@/design-system/palette';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons, type IonIconName } from '@/components/ui/ion-icons';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme/ThemeProvider';

/** Mobile `AuthFooterButton` / welcome “Agree and continue” — brand green bar, white label. */
const ENABLED_BG = lightPalette.brand;
const ENABLED_FG = lightPalette.onBrand;

export type ActiveBarButtonProps = {
  label: string;
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Trailing chevron (welcome, some auth steps). */
  showChevron?: boolean;
  icon?: IonIconName;
  className?: string;
};

export function ActiveBarButton({
  label,
  type = 'button',
  onClick,
  disabled = false,
  loading = false,
  showChevron = false,
  icon,
  className,
}: ActiveBarButtonProps) {
  const colors = useColors();
  const inert = disabled || loading;
  const backgroundColor = inert ? colors.surface : ENABLED_BG;
  const color = inert ? colors.muted : ENABLED_FG;

  return (
    <button
      type={type}
      disabled={inert}
      aria-busy={loading}
      onClick={onClick}
      style={{ backgroundColor, color }}
      className={cn(
        'flex min-h-12 w-full flex-row items-center justify-center gap-1 rounded-2xl border-0 px-6 py-4 text-lg font-semibold active:opacity-90 disabled:opacity-100',
        className,
      )}
    >
      {loading ? (
        <span aria-hidden>…</span>
      ) : (
        <>
          {icon ? <IonIcon icon={ionIcons[icon]} size={20} color={color} /> : null}
          <span>{label}</span>
          {showChevron ? (
            <IonIcon icon={ionIcons['chevron-forward']} size={22} color={color} className="ml-0.5 shrink-0" />
          ) : null}
        </>
      )}
    </button>
  );
}
