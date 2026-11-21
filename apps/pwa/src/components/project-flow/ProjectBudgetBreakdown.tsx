'use client';

import { formatMoney } from '@/lib/format';

type Row = {
  label: string;
  kobo: number;
  emphasis?: boolean;
  helper?: string;
};

export function ProjectBudgetBreakdown({
  currency,
  budgetTotalKobo,
  contributedTotalKobo,
  paidOutKobo,
  reservedKobo,
  availableKobo,
}: {
  currency: string;
  budgetTotalKobo: number;
  contributedTotalKobo: number;
  paidOutKobo: number;
  reservedKobo: number;
  availableKobo: number;
}) {
  const rows: Row[] = [
    {
      label: 'Raised',
      kobo: contributedTotalKobo,
      helper: 'In the funding pool from successful contributions',
    },
    { label: 'Paid out', kobo: paidOutKobo },
    {
      label: 'Reserved',
      kobo: reservedKobo,
      helper: 'Secured for accepted work, not yet paid out',
    },
    {
      label: 'Available',
      kobo: availableKobo,
      emphasis: true,
      helper: 'Uncommitted pool balance for new assignments',
    },
  ];

  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Budget breakdown</p>
      <p className="text-xs text-muted">
        Total budget {formatMoney(budgetTotalKobo / 100, currency)} is the project cap. Only raised
        pool cash can be reserved or paid out.
      </p>
      <dl className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-0.5">
            <div className="flex flex-row items-baseline justify-between gap-3">
              <dt className="text-sm text-muted">{row.label}</dt>
              <dd
                className={
                  row.emphasis
                    ? 'text-sm font-semibold text-active'
                    : 'text-sm font-semibold text-ink'
                }
              >
                {formatMoney(row.kobo / 100, currency)}
              </dd>
            </div>
            {row.helper ? <dd className="text-xs text-subtle">{row.helper}</dd> : null}
          </div>
        ))}
      </dl>
    </div>
  );
}