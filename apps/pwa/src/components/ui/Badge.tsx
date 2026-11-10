import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface',
  brand: 'bg-brand-soft',
  active: 'bg-active-soft',
  danger: 'bg-danger-soft',
  warning: 'bg-warning-soft',
  info: 'bg-info-soft',
};

const labels: Record<Tone, string> = {
  neutral: 'text-muted',
  brand: 'text-brand',
  active: 'text-active',
  danger: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
};

const dots: Record<Tone, string> = {
  neutral: 'bg-subtle',
  brand: 'bg-brand',
  active: 'bg-active',
  danger: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
};

export function Badge({
  label,
  tone = 'neutral',
  dot = true,
}: {
  label: string;
  tone?: Tone;
  dot?: boolean;
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1', tones[tone])}
    >
      {dot ? <span className={cn('h-1.5 w-1.5 rounded-full', dots[tone])} aria-hidden /> : null}
      <span className={cn('text-xs font-semibold', labels[tone])}>{label}</span>
    </span>
  );
}
