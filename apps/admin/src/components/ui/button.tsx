import { cn } from '@/lib/cn';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand-dark focus-visible:ring-brand/40 disabled:bg-brand/60',
  secondary:
    'border border-border bg-elevated text-ink hover:bg-surface focus-visible:ring-slate-300',
  ghost: 'text-ink hover:bg-surface focus-visible:ring-slate-300',
  danger:
    'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-300 disabled:bg-red-400',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
};

export function Button({
  className,
  variant = 'primary',
  loading,
  disabled,
  children,
  ...props
}: Props) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed',
        variantClasses[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden
        />
      ) : null}
      {children}
    </button>
  );
}
