import Link from 'next/link';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';

import { StatusBadge } from '@/components/admin/status-badge';
import { fetchAdminWallet } from '@/lib/admin/finance';
import { requireAdminSessionForPath } from '@/lib/admin/session';
import { formatNgnFromKobo } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ userId: string }> };

export default async function WalletDetailPage({ params }: Props) {
  await requireAdminSessionForPath('/wallets');
  const { userId } = await params;

  let data: Awaited<ReturnType<typeof fetchAdminWallet>>;
  try {
    data = await fetchAdminWallet(userId);
  } catch {
    notFound();
  }

  const wallet = data.wallet as Record<string, unknown> | null;
  const user = data.user as Record<string, unknown>;
  const locks = data.payment_locks as Array<Record<string, unknown>>;
  const ledger = data.ledger as Array<Record<string, unknown>>;
  const balanceCheck = data.balance_check as Record<string, number>;

  const mismatch = balanceCheck.active_locks_total_kobo !== balanceCheck.stored_locked_balance_kobo;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/wallets" className="text-sm text-brand hover:text-brand-dark">
          ← Wallets
        </Link>
        <h2 className="mt-1 text-2xl font-semibold text-ink">{user.display_name as string}</h2>
        <p className="text-sm text-muted">{userId}</p>
      </div>

      {wallet ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <BalanceCard label="Available" kobo={wallet.available_kobo as number} />
          <BalanceCard label="Locked (wallet field)" kobo={wallet.locked_balance_kobo as number} />
          <BalanceCard label="Locked engagements" kobo={wallet.locked_engagement_kobo as number} />
          <BalanceCard label="Pending escrow" kobo={wallet.pending_kobo as number} />
        </section>
      ) : (
        <p className="text-sm text-muted">No wallet row for this user.</p>
      )}

      {mismatch ? (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="alert"
        >
          Stored locked balance ({formatNgnFromKobo(balanceCheck.stored_locked_balance_kobo)}) does
          not match the sum of active payment locks (
          {formatNgnFromKobo(balanceCheck.active_locks_total_kobo)}). See Operational issues.
        </p>
      ) : null}

      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Payment locks</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {locks.length === 0 ? (
            <li className="text-muted">No payment locks.</li>
          ) : (
            locks.map((lock) => (
              <li
                key={lock.request_id as string}
                className="rounded-lg border border-border bg-surface px-3 py-2"
              >
                <Link
                  href={`/requests/${lock.request_id as string}`}
                  className="font-medium text-brand"
                >
                  {lock.request_title as string}
                </Link>
                <p className="text-xs capitalize text-muted">
                  {lock.request_status as string} · payment {lock.payment_status as string} ·{' '}
                  {lock.bucket as string} · {lock.lock_status as string}
                </p>
                <p className="mt-1">{formatNgnFromKobo(lock.total as number)} total</p>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Ledger entries</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="py-2">Time</th>
                <th className="py-2">Type</th>
                <th className="py-2">Status</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Request</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((entry) => (
                <tr key={entry.id as string} className="border-t border-border/60">
                  <td className="py-2">
                    <Link href={`/transactions/${entry.id as string}`} className="text-brand">
                      {format(new Date(entry.created_at as string), 'PP')}
                    </Link>
                  </td>
                  <td className="py-2 capitalize">{(entry.type as string).replaceAll('_', ' ')}</td>
                  <td className="py-2">
                    <StatusBadge status={entry.status as string} />
                  </td>
                  <td className="py-2">{formatNgnFromKobo(entry.amount as number)}</td>
                  <td className="py-2">
                    {entry.request_id ? (
                      <Link href={`/requests/${entry.request_id as string}`} className="text-brand">
                        View
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function BalanceCard({ label, kobo }: { label: string; kobo: number }) {
  return (
    <div className="rounded-xl border border-border bg-elevated p-4 shadow-card">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink">{formatNgnFromKobo(kobo)}</p>
    </div>
  );
}
