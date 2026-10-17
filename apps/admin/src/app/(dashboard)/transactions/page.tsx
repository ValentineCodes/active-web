import Link from 'next/link';
import { type ReactNode, Suspense } from 'react';
import { format, subDays } from 'date-fns';

import { ListPagination } from '@/components/admin/pagination';
import { ListToolbar } from '@/components/admin/list-toolbar';
import { StatusBadge } from '@/components/admin/status-badge';
import { FinanceSummaryPanel } from '@/components/finance/finance-summary-panel';
import {
  DEPOSIT_STATUS_FILTERS,
  TRANSACTION_STATUS_FILTERS,
  TRANSACTION_TYPE_FILTERS,
  fetchAdminDeposits,
  fetchAdminTransactions,
  fetchFinanceSummary,
} from '@/lib/admin/finance';
import { requireAdminSessionForPath } from '@/lib/admin/session';
import { formatNgnFromKobo } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TransactionsPage({ searchParams }: Props) {
  await requireAdminSessionForPath('/transactions');
  const params = await searchParams;
  const view = typeof params.view === 'string' ? params.view : 'ledger';
  const query = typeof params.q === 'string' ? params.q : '';
  const typeGroup = typeof params.filter === 'string' ? params.filter : 'all';
  const status = typeof params.status === 'string' ? params.status : 'all';
  const limit = Math.min(100, Math.max(1, Number(params.limit ?? 25) || 25));
  const offset = Math.max(0, Number(params.offset ?? 0) || 0);

  const periodEnd = new Date();
  const periodStart = subDays(periodEnd, 30);
  const summary = await fetchFinanceSummary(periodStart.toISOString(), periodEnd.toISOString());
  const financial = (summary.financial as Record<string, number> | null) ?? null;
  const snapshots = (summary.snapshots as Record<string, number> | null) ?? null;
  const unavailable = Array.isArray(summary.unavailable_metrics)
    ? (summary.unavailable_metrics as Array<{ key: string; reason: string }>)
    : [];

  const ledger =
    view === 'deposits'
      ? null
      : await fetchAdminTransactions({ query, typeGroup, status, limit, offset });
  const deposits =
    view === 'deposits'
      ? await fetchAdminDeposits({
          query,
          status: typeGroup === 'all' ? status : typeGroup,
          limit,
          offset,
        })
      : null;

  const statusLinks = (view === 'deposits' ? DEPOSIT_STATUS_FILTERS : TRANSACTION_STATUS_FILTERS).map(
    (option) => {
      const next = new URLSearchParams();
      if (query) next.set('q', query);
      if (view !== 'ledger') next.set('view', view);
      if (typeGroup !== 'all') next.set('filter', typeGroup);
      if (option.value !== 'all') next.set('status', option.value);
      return { ...option, href: `/transactions?${next.toString()}` };
    },
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Transactions</h2>
        <p className="mt-1 text-sm text-muted">
          Append-only wallet ledger (kobo) and Paystack deposit lifecycle. Amounts are integer kobo; NGN only.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Commission &amp; revenue (last 30 days)</h3>
        <p className="mt-1 text-xs text-muted">
          Deposits and locked user funds are not counted as collected platform revenue.
        </p>
        <div className="mt-4">
          <FinanceSummaryPanel financial={financial} snapshots={snapshots} unavailable={unavailable} />
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <TabLink href="/transactions" active={view === 'ledger'}>Ledger</TabLink>
        <TabLink href="/transactions?view=deposits" active={view === 'deposits'}>Paystack deposits</TabLink>
      </div>

      <Suspense fallback={<div className="h-12 animate-pulse rounded-lg bg-border" />}>
        <ListToolbar
          basePath={view === 'deposits' ? '/transactions?view=deposits' : '/transactions'}
          searchPlaceholder="Search id, reference, Paystack ref, user, or request"
          filterOptions={
            view === 'deposits'
              ? [...DEPOSIT_STATUS_FILTERS]
              : [...TRANSACTION_TYPE_FILTERS]
          }
        />
      </Suspense>

      <div className="flex flex-wrap gap-2 text-sm">
        {statusLinks.map((option) => (
          <Link
            key={option.value}
            href={option.href}
            className={
              status === option.value
                ? 'rounded-lg bg-brand px-3 py-1 text-white'
                : 'rounded-lg border border-border px-3 py-1 text-muted hover:text-ink'
            }
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-card">
        <div className="overflow-x-auto">
          {view === 'deposits' && deposits ? (
            <table className="min-w-[960px] w-full text-left text-sm">
              <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">References</th>
                </tr>
              </thead>
              <tbody>
                {deposits.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted">No deposits found.</td>
                  </tr>
                ) : (
                  deposits.items.map((row) => {
                    const item = row as Record<string, unknown>;
                    return (
                      <tr key={item.id as string} className="border-b border-border/70 last:border-0">
                        <td className="px-4 py-3">
                          <Link href={`/transactions/deposits/${item.id as string}`} className="text-brand">
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
                        <td className="px-4 py-3 text-xs text-muted">
                          <p>{item.reference as string}</p>
                          <p>{(item.paystack_reference as string) ?? '—'}</p>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : ledger ? (
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Request</th>
                  <th className="px-4 py-3 font-medium">Reference</th>
                </tr>
              </thead>
              <tbody>
                {ledger.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted">No ledger entries found.</td>
                  </tr>
                ) : (
                  ledger.items.map((tx) => (
                    <tr key={tx.id} className="border-b border-border/70 last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`/transactions/${tx.id}`} className="text-brand">
                          {format(new Date(tx.created_at), 'PPp')}
                        </Link>
                      </td>
                      <td className="px-4 py-3 capitalize">{tx.type.replaceAll('_', ' ')}</td>
                      <td className="px-4 py-3"><StatusBadge status={tx.status} /></td>
                      <td className="px-4 py-3">
                        <Link href={`/wallets/${tx.user_id}`} className="text-brand">{tx.user_name ?? tx.user_id.slice(0, 8)}</Link>
                      </td>
                      <td className="px-4 py-3">{formatNgnFromKobo(tx.amount)}</td>
                      <td className="px-4 py-3">
                        {tx.request_id ? (
                          <Link href={`/requests/${tx.request_id}`} className="text-brand">View</Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        <p className="truncate max-w-48">{tx.reference}</p>
                        {tx.paystack_reference ? <p>{tx.paystack_reference}</p> : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : null}
        </div>
        <div className="px-4 pb-4">
          <ListPagination
            basePath={view === 'deposits' ? '/transactions' : '/transactions'}
            searchParams={{
              q: query || undefined,
              view: view === 'deposits' ? 'deposits' : undefined,
              filter: typeGroup === 'all' ? undefined : typeGroup,
              status: status === 'all' ? undefined : status,
            }}
            total={view === 'deposits' ? deposits?.total ?? 0 : ledger?.total ?? 0}
            limit={limit}
            offset={offset}
          />
        </div>
      </div>
    </div>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white'
          : 'rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-ink'
      }
    >
      {children}
    </Link>
  );
}
