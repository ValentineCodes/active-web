import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';

type BadgeTone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';

export function ActivityMyRequestCard({
  title,
  responseLine,
  amount,
  badge,
  to,
}: {
  title: string;
  responseLine: string;
  amount: string | null;
  badge: { label: string; tone: BadgeTone };
  to: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'shadow-card flex flex-col gap-4 rounded-2xl border border-hairline bg-elevated p-4 active:opacity-90',
      )}
    >
      <div className="flex flex-row items-start justify-between gap-3">
        <p className="line-clamp-2 flex-1 text-xl font-bold leading-7 text-ink">{title}</p>
        <Badge label={badge.label} tone={badge.tone} dot={false} />
      </div>
      <div className="flex flex-row items-end justify-between gap-3">
        <p className="flex-1 text-sm text-muted">{responseLine}</p>
        {amount ? <p className="text-lg font-bold text-active">{amount}</p> : null}
      </div>
    </Link>
  );
}

export function ActivityMyResponseCard({
  title,
  metaLine,
  offerLine,
  badge,
  to,
}: {
  title: string;
  metaLine: string;
  offerLine: string | null;
  badge: { label: string; tone: BadgeTone };
  to: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'shadow-card flex flex-col gap-2 rounded-2xl border border-hairline bg-elevated p-4 active:opacity-90',
      )}
    >
      <p className="line-clamp-2 text-xl font-bold leading-7 text-ink">{title}</p>
      <p className="truncate text-sm text-muted">{metaLine}</p>
      <div className="flex flex-row items-end justify-between gap-3 pt-1">
        {offerLine ? (
          <p className="line-clamp-1 flex-1 text-base font-semibold text-active">{offerLine}</p>
        ) : (
          <span className="flex-1" />
        )}
        <Badge label={badge.label} tone={badge.tone} dot={false} />
      </div>
    </Link>
  );
}
