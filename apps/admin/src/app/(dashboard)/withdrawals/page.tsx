import Link from 'next/link';
import { Suspense } from 'react';
import { format } from 'date-fns';

import { ListPagination } from '@/components/admin/pagination';
import { StatusBadge } from '@/components/admin/status-badge';
import { WithdrawalsFilters } from '@/components/withdrawals/withdrawals-filters';
import { WithdrawalsOverviewCards } from '@/components/withdrawals/withdrawals-overview';
import { WithdrawalPolicyPanel } from '@/components/withdrawals/withdrawal-policy-panel';
import { fetchAdminWithdrawalPolicy } from '@/lib/admin/withdrawal-policy';
import { fetchAdminWithdrawals, fetchWithdrawalsOverview } from '@/lib/admin/withdrawals';
import { requireAdminSessionForPath } from '@/lib/admin/session';
import { formatNgnFromKobo } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function paramString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

export default async function WithdrawalsPage({ searchParams }: Props) {
  await requireAdminSessionForPath('/withdrawals');
  const params = await searchParams;
  const query = paramString(params.q);
  const filter = paramString(params.filter) || 'all';
  const userId = paramString(params.userId);
  const submittedFrom = paramString(params.from);
  const submittedTo = paramString(params.to);
  const amountMin = paramString(params.amountMin);
  const amountMax = paramString(params.amountMax);
  const limit = Math.min(100, Math.max(1, Number(params.limit ?? 25) || 25));
  const offset = Math.max(0, Number(params.offset ?? 0) || 0);

  const [overview, result, withdrawalPolicy] = await Promise.all([
    fetchWithdrawalsOverview(),
    fetchAdminWithdrawals({
      query,
      status: filter,
      submittedFrom: submittedFrom || undefined,
      submittedTo: submittedTo ? `${submittedTo}T23:59:59` : undefined,
      amountMinNgn: amountMin || undefined,
      amountMaxNgn: amountMax || undefined,
      userId: userId || undefined,
      limit,
      offset,
    }),
    fetchAdminWithdrawalPolicy(),
  ]);

  const paginationParams: Record<string, string | undefined> = {
    q: query || undefined,
    filter: filter === 'all' ? undefined : filter,
    userId: userId || undefined,
    from: submittedFrom || undefined,
    to: submittedTo || undefined,
    amountMin: amountMin || undefined,
    amountMax: amountMax || undefined,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Withdrawals</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Manual payout queue. Active does not initiate bank transfers — send payment through your
          approved external banking channel, then record the outcome here. All actions run through
          secured database operations with audit logging.
        </p>
      </div>

      <WithdrawalPolicyPanel initial={withdrawalPolicy} />

      <WithdrawalsOverviewCards overview={overview} />

      <Suspense fallback={<div className="h-24 animate-pulse rounded-lg bg-border" />}>
        <WithdrawalsFilters />
      </Suspense>

      <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Bank</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {result.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    No withdrawals found.
                  </td>
                </tr>
              ) : (
                result.items.map((item) => (
                  <tr key={item.id} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/withdrawals/${item.id}`}
                        className="break-all font-mono text-xs text-brand"
                      >
                        {item.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{item.user_name ?? '—'}</div>
                      <Link
                        href={`/users/${item.user_id}`}
                        className="font-mono text-xs text-muted"
                      >
                        {item.user_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{formatNgnFromKobo(item.amount)}</td>
                    <td className="px-4 py-3">{item.destination_bank_name}</td>
                    <td className="px-4 py-3">
                      <div>{item.destination_account_number_masked}</div>
                      <div className="text-xs text-muted">{item.destination_account_name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {format(new Date(item.created_at), 'PPp')}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {format(new Date(item.updated_at), 'PPp')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <ListPagination
            basePath="/withdrawals"
            searchParams={paginationParams}
            total={result.total}
            limit={limit}
            offset={offset}
          />
        </div>
      </div>
    </div>
  );
}
