'use client';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';
import { cn } from '@/lib/cn';

type Props = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  showChevron?: boolean;
};

/** Full-width auth CTA — matches native `AuthFooterButton` (mobile palette tokens). */
export function AuthFooterButton({
  label,
  onClick,
  disabled = false,
  loading = false,
  showChevron = true,
}: Props) {
  const colors = useColors();
  const inert = disabled || loading;

  return (
    <button
      type="button"
      disabled={inert}
      aria-busy={loading}
      onClick={onClick}
      className={cn(
        'flex min-h-12 w-full flex-row items-center justify-center rounded-2xl border-0 px-6 py-4 active:opacity-90',
        inert ? 'auth-footer-cta--disabled' : 'auth-footer-cta',
      )}
    >
      {loading ? (
        <span className="auth-footer-cta-label text-lg font-semibold opacity-80" aria-hidden>
          …
        </span>
      ) : (
        <>
          <span className={cn('auth-footer-cta-label text-lg font-semibold', inert && 'opacity-80')}>{label}</span>
          {showChevron ? (
            <IonIcon
              icon={ionIcons['chevron-forward']}
              size={22}
              color={inert ? colors.muted : '#FFFFFF'}
              className="ml-1 shrink-0"
            />
          ) : null}
        </>
      )}
    </button>
  );
}
