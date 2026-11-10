'use client';

import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { formatAgo, formatMoney } from '@/lib/format';
import { cn } from '@/lib/cn';

type BadgeTone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';

export function ResponseCard({
  displayName,
  avatarPath,
  message,
  quotedAmount,
  currency,
  createdAt,
  statusLabel,
  statusTone,
  actions,
  className,
}: {
  displayName: string | null;
  avatarPath: string | null;
  message: string | null;
  quotedAmount: number | null;
  currency: string;
  createdAt: string;
  statusLabel?: string;
  statusTone?: BadgeTone;
  actions?: ReactNode;
  className?: string;
}) {
  const offerLabel = quotedAmount !== null ? formatMoney(quotedAmount, currency) : null;

  return (
    <article
      className={cn('shadow-card flex flex-col gap-4 rounded-2xl border border-hairline bg-elevated p-4', className)}
    >
      {statusLabel ? <Badge label={statusLabel} tone={statusTone ?? 'neutral'} /> : null}
      <div className="flex flex-row items-center gap-3">
        <Avatar path={avatarPath} name={displayName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-ink">{displayName ?? 'Helper'}</p>
          <p className="text-xs text-subtle">{formatAgo(createdAt)}</p>
        </div>
        {offerLabel ? <p className="shrink-0 text-lg font-bold text-active">{offerLabel}</p> : null}
      </div>
      {message ? <p className="text-base leading-6 text-muted">{message}</p> : null}
      {actions ? <div className="flex flex-col gap-2">{actions}</div> : null}
    </article>
  );
}
