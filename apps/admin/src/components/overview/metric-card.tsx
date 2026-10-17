import Link from 'next/link';

import { cn } from '@/lib/cn';

type Props = {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  className?: string;
};

export function MetricCard({ label, value, hint, href, className }: Props) {
  const content = (
    <div
      className={cn(
        'rounded-xl border border-border bg-elevated p-4 shadow-card transition-colors',
        href && 'hover:border-brand/40 hover:bg-brand-light/30',
        className,
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {hint ? <p className="mt-2 text-xs leading-relaxed text-subtle">{hint}</p> : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50">
        {content}
      </Link>
    );
  }

  return content;
}
