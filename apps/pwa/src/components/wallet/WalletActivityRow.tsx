import Link from 'next/link';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import type { WalletActivityRow as WalletActivityRowType } from '@/features/wallet/activity';
import { walletActivityListMeta } from '@/features/wallet/presentation';
import { cn } from '@/lib/cn';

export function WalletActivityRow({
  row,
  currency,
  to,
  showDivider,
}: {
  row: WalletActivityRowType;
  currency: string;
  to?: string;
  showDivider?: boolean;
}) {
  const meta = walletActivityListMeta(row, currency);
  const { visual } = meta;
  const iconBg = visual.incoming ? 'bg-active-soft' : 'bg-surface';
  const iconColor = visual.incoming ? '#1FA35A' : '#5C665E';
  const icon = visual.incoming ? ionIcons['arrow-down'] : ionIcons['arrow-up'];

  const body = (
    <>
      {showDivider ? <div className="ml-14 h-px bg-hairline" /> : null}
      <div className="flex flex-row items-center gap-3 py-4">
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-full', iconBg)}>
          <IonIcon icon={icon} size={20} color={iconColor} />
        </div>
        <div className="min-w-0 flex-1 gap-1">
          <p className="text-sm font-semibold text-ink">{meta.title}</p>
          {meta.subtitle ? <p className="truncate text-sm text-muted">{meta.subtitle}</p> : null}
          <p className="text-sm text-muted">
            {meta.when}
            {meta.statusLabel ? (
              <>
                {' · '}
                <span
                  className={cn(
                    'font-medium',
                    row.withdrawal?.queueStatus === 'completed' && 'text-active',
                    (row.withdrawal?.queueStatus === 'pending' ||
                      row.withdrawal?.queueStatus === 'processing') &&
                      'text-warning',
                    (row.withdrawal?.queueStatus === 'rejected' ||
                      row.withdrawal?.queueStatus === 'failed') &&
                      'text-danger',
                  )}
                >
                  {meta.statusLabel}
                </span>
              </>
            ) : null}
            {visual.statusTag === 'locked' ? (
              <>
                {' · '}
                <span className="font-medium text-warning">Locked</span>
              </>
            ) : null}
            {visual.statusTag === 'returned' ? (
              <>
                {' · '}
                <span className="font-medium text-active">Returned</span>
              </>
            ) : null}
          </p>
        </div>
        {meta.signedAmount ? (
          <p
            className={cn(
              'shrink-0 text-sm font-bold',
              visual.incoming ? 'text-active' : 'text-ink',
            )}
          >
            {meta.signedAmount}
          </p>
        ) : null}
      </div>
    </>
  );

  if (to) {
    return (
      <Link href={to} className="block active:opacity-90">
        {body}
      </Link>
    );
  }

  return <div>{body}</div>;
}
