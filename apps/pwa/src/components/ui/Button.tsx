import { cn } from '@/lib/cn';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons, type IonIconName } from '@/components/ui/ion-icons';

type Variant = 'primary' | 'active' | 'secondary' | 'ghost' | 'danger';

const containers: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand',
  active: 'bg-active text-on-brand',
  secondary: 'bg-surface text-ink',
  ghost: 'bg-transparent text-brand',
  danger: 'bg-danger-soft text-danger',
};

const cornerClasses = {
  full: 'rounded-full',
  '2xl': 'rounded-2xl',
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
  const inert = disabled || loading;
  const fg = variant === 'primary' || variant === 'active' ? '#ffffff' : variant === 'danger' ? '#DC2626' : '#166A3D';

  return (
    <button
      type={type}
      disabled={inert}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-center active:opacity-80 disabled:opacity-40',
        cornerClasses[corner],
        size === 'lg' ? 'px-6 py-4 text-lg' : 'px-5 py-3.5 text-base',
        'font-semibold',
        containers[variant],
        className,
      )}
    >
      {loading ? (
        <span className="opacity-80">Please wait…</span>
      ) : (
        <span className="inline-flex items-center gap-2">
          {icon ? <IonIcon icon={ionIcons[icon]} size={size === 'lg' ? 20 : 18} color={fg} /> : null}
          {label}
        </span>
      )}
    </button>
  );
}
