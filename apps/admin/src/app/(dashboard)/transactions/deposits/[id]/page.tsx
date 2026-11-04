import Link from 'next/link';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';

import { StatusBadge } from '@/components/admin/status-badge';
import { fetchAdminDeposit } from '@/lib/admin/finance';
import { requireAdminSessionForPath } from '@/lib/admin/session';
import { formatNgnFromKobo } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function DepositDetailPage({ params }: Props) {
  await requireAdminSessionForPath('/transactions');
  const { id } = await params;

  let data: Awaited<ReturnType<typeof fetchAdminDeposit>>;
  try {
    data = await fetchAdminDeposit(id);
  } catch {
    notFound();
  }

  const deposit = data.deposit as Record<string, unknown>;
  const user = data.user as Record<string, unknown>;
  const walletTx = data.wallet_transaction as Record<string, unknown> | null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/transactions?view=deposits"
          className="text-sm text-brand hover:text-brand-dark"
        >
          ← Deposits
        </Link>
        <h2 className="mt-1 text-2xl font-semibold text-ink">Paystack deposit</h2>
        <p className="text-sm text-muted">{id}</p>
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge status={deposit.status as string} />
          <span className="text-sm">{formatNgnFromKobo(deposit.amount as number)}</span>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-muted">User</dt>
            <dd>
              <Link href={`/wallets/${deposit.user_id as string}`} className="text-brand">
                {user.display_name as string}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Created</dt>
            <dd>{format(new Date(deposit.created_at as string), 'PPpp')}</dd>
          </div>
          <div>
            <dt className="text-muted">Reference</dt>
            <dd className="break-all font-mono text-xs">{deposit.reference as string}</dd>
          </div>
          <div>
            <dt className="text-muted">Paystack reference</dt>
            <dd className="break-all font-mono text-xs">
              {(deposit.paystack_reference as string) ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Completed</dt>
            <dd>
              {deposit.completed_at
                ? format(new Date(deposit.completed_at as string), 'PPpp')
                : '—'}
            </dd>
          </div>
        </dl>
      </section>

      {walletTx ? (
        <section className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
          <h3 className="font-semibold text-ink">Ledger credit</h3>
          <Link
            href={`/transactions/${walletTx.id as string}`}
            className="mt-2 inline-block text-brand"
          >
            View wallet transaction →
          </Link>
        </section>
      ) : (
        <p className="text-sm text-amber-800">
          No linked wallet transaction yet — check reconciliation if status is completed.
        </p>
      )}
    </div>
  );
}
