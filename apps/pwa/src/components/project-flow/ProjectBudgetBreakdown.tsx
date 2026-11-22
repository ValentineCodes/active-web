'use client';

import { formatMoney } from '@/lib/format';

export function ProjectBudgetBreakdown({
  currency,
  paidOutKobo,
  reservedKobo,
  availableKobo,
}: {
  currency: string;
  paidOutKobo: number;
  reservedKobo: number;
  availableKobo: number;
}) {
  const rows: { label: string; kobo: number }[] = [
    { label: 'Paid out', kobo: paidOutKobo },
    { label: 'Reserved', kobo: reservedKobo },
    { label: 'Available', kobo: availableKobo },
  ];

  return (
    <div className="border-t border-hairline pt-3">
      <dl className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-row items-baseline justify-between gap-3">
            <dt className="text-sm text-muted">{row.label}</dt>
            <dd className="text-sm font-semibold text-ink">
              {formatMoney(row.kobo / 100, currency)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}