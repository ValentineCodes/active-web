import Link from 'next/link';
import { Suspense } from 'react';
import { format } from 'date-fns';

import { ListPagination } from '@/components/admin/pagination';
import { ListToolbar } from '@/components/admin/list-toolbar';
import { StatusBadge } from '@/components/admin/status-badge';
import { WITHDRAWAL_STATUS_FILTERS, fetchAdminWithdrawals } from '@/lib/admin/finance';
import { requireAdminSessionForPath } from '@/lib/admin/session';
import { formatNgnFromKobo } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WithdrawalsPage({ searchParams }: Props) {
  await requireAdminSessionForPath('/withdrawals');
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q : '';
  const filter = typeof params.filter === 'string' ? params.filter : 'all';
  const limit = Math.min(100, Math.max(1, Number(params.limit ?? 25) || 25));
  const offset = Math.max(0, Number(params.offset ?? 0) || 0);

  const result = await fetchAdminWithdrawals({ query, status: filter, limit, offset });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Withdrawals</h2>
        <p className="mt-1 text-sm text-muted">
          Ledger rows with type <code className="text-xs">withdrawal</code>. Consumer withdrawals are not productized;
          payout success must be confirmed by Paystack/backend settlement — not manual admin clicks.
        </p>
      </div>

      <Suspense fallback={<div className="h-12 animate-pulse rounded-lg bg-border" />}>
        <ListToolbar
          basePath="/withdrawals"
          searchPlaceholder="Search user, reference, or Paystack ref"
          filterOptions={[...WITHDRAWAL_STATUS_FILTERS]}
        />
      </Suspense>

      <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Reference</th>
              </tr>
            </thead>
            <tbody>
              {result.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">No withdrawals found.</td>
                </tr>
              ) : (
                result.items.map((row) => {
                  const item = row as Record<string, unknown>;
                  return (
                    <tr key={item.id as string} className="border-b border-border/70 last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`/withdrawals/${item.id as string}`} className="text-brand">
                          {format(new Date(item.created_at as string), 'PPp')}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/wallets/${item.user_id as string}`} className="text-brand">
                          {item.user_name as string}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{formatNgnFromKobo(item.amount as number)}</td>
                      <td className="px-4 py-3"><StatusBadge status={item.status as string} /></td>
                      <td className="px-4 py-3 text-xs text-muted break-all">{item.reference as string}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <ListPagination
            basePath="/withdrawals"
            searchParams={{ q: query || undefined, filter: filter === 'all' ? undefined : filter }}
            total={result.total}
            limit={limit}
            offset={offset}
          />
        </div>
      </div>
    </div>
  );
}
