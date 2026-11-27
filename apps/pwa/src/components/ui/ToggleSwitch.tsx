'use client';

import { cn } from '@/lib/cn';

export function ToggleSwitch({
  checked,
  disabled,
  onChange,
  'aria-label': ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  'aria-label': string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-active focus-visible:ring-offset-2 focus-visible:ring-offset-elevated',
        checked ? 'bg-active' : 'bg-hairline',
        disabled ? 'opacity-50' : 'active:opacity-90',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'block h-6 w-6 rounded-full bg-elevated shadow-sm transition-transform duration-200 ease-out',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}