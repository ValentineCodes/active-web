import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

type Tone = 'surface' | 'brand' | 'active' | 'warning' | 'danger';

const toneClasses: Record<Tone, string> = {
  surface: 'bg-canvas',
  brand: 'bg-brand-soft',
  active: 'bg-active-soft',
  warning: 'bg-warning-soft',
  danger: 'bg-danger-soft',
};

export function Card({
  tone = 'surface',
  className,
  children,
  ...props
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'gap-3 rounded-3xl p-5',
        toneClasses[tone],
        tone === 'surface' ? 'shadow-card' : '',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
