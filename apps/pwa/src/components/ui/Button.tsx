'use client';

import { ShadcnButton, buttonVariants } from '@/components/ui/primitives/button';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons, type IonIconName } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'active' | 'secondary' | 'ghost' | 'danger';

const variantMap: Record<Variant, NonNullable<Parameters<typeof buttonVariants>[0]>['variant']> = {
  primary: 'default',
  active: 'active',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'destructive',
};

const cornerClasses = {
  full: 'rounded-full',
  '2xl': '!rounded-2xl',
} as const;

type Props = {
  label: string;
  type?: 'button' | 'submit';
  onClick?: () => void;
  variant?: Variant;
  icon?: IonIconName;
  size?: 'md' | 'lg';
  corner?: keyof typeof cornerClasses;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
};

export function Button({
  label,
  type = 'button',
  onClick,
  variant = 'primary',
  icon,
  size = 'md',
  corner = 'full',
  loading = false,
  disabled = false,
  className,
}: Props) {
  const colors = useColors();
  const inert = disabled || loading;
  const shadcnVariant = variantMap[variant];

  const foregrounds: Record<Variant, string> = {
    primary: colors.onBrand,
    active: colors.onBrand,
    secondary: colors.ink,
    ghost: colors.brand,
    danger: colors.danger,
  };

  return (
    <ShadcnButton
      type={type}
      disabled={inert}
      aria-busy={loading}
      variant={shadcnVariant}
      size={size === 'lg' ? 'lg' : 'default'}
      onClick={onClick}
      className={cn('w-full', cornerClasses[corner], className)}
    >
      {loading ? (
        <span className="opacity-80" aria-hidden>
          …
        </span>
      ) : (
        <>
          {icon ? (
            <IonIcon icon={ionIcons[icon]} size={size === 'lg' ? 20 : 18} color={foregrounds[variant]} />
          ) : null}
          {label}
        </>
      )}
    </ShadcnButton>
  );
}
