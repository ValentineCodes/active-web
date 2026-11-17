'use client';

import { type MilestoneProposalItem, type PaymentStructure } from '@/features/requests/milestones';
import { MARKET } from '@/config/index';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';

export function MilestonePlanCard({
  paymentStructure,
  milestones,
  currency = MARKET.currency,
  helperNote,
  variant = 'default',
  heading = 'Milestone plan',
  // Kept for call-site compatibility; allocation display removed from this card.
  totalMajor: _totalMajor,
  compact: _compact,
  showBudgetProgress: _showBudgetProgress,
}: {
  paymentStructure: PaymentStructure;
  totalMajor?: number | null;
  milestones: MilestoneProposalItem[];
  currency?: string;
  heading?: string;
  helperNote?: string;
  variant?: 'default' | 'proposed';
  compact?: boolean;
  showBudgetProgress?: boolean;
}) {
  if (paymentStructure !== 'milestone' || milestones.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex w-full min-w-0 max-w-full flex-col gap-3 rounded-[14px] border border-hairline bg-elevated px-4 py-3.5',
        variant === 'proposed' ? 'border-dashed' : '',
      )}
    >
      {helperNote ? <p className="m-0 text-sm leading-5 text-muted">{helperNote}</p> : null}

      <ol className="m-0 flex list-none flex-col p-0" aria-label={heading}>
        {milestones.map((item, index) => {
          const isLast = index === milestones.length - 1;
          return (
            <li
              key={item.position}
              className={cn(
                'grid w-full min-w-0 grid-cols-[28px_minmax(0,1fr)] gap-3',
                isLast ? 'pb-0' : 'pb-3.5',
              )}
            >
              <span className="relative flex min-h-full shrink-0 flex-col items-center" aria-hidden>
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-extrabold text-canvas">
                  {item.position}
                </span>
                {!isLast ? (
                  <span className="mt-1.5 min-h-4 w-0.5 flex-1 bg-hairline" />
                ) : null}
              </span>
              <article className="min-w-0 w-full max-w-full overflow-hidden">
                <div className="flex min-w-0 flex-row items-start justify-between gap-2">
                  <h5 className="m-0 min-w-0 flex-1 text-base font-semibold text-ink">{item.title}</h5>
                  <span className="shrink-0 text-base font-bold text-ink">
                    {formatMoney(item.amount, currency)}
                  </span>
                </div>
                {item.description ? (
                  <p className="mt-1 text-sm leading-5 text-muted">{item.description}</p>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}