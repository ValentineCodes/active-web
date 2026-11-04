import Link from 'next/link';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';

import { StatusBadge } from '@/components/admin/status-badge';
import { fetchAdminTransaction } from '@/lib/admin/finance';
import { requireAdminSessionForPath } from '@/lib/admin/session';
import { formatNgnFromKobo } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function TransactionDetailPage({ params }: Props) {
  await requireAdminSessionForPath('/transactions');
  const { id } = await params;

  let data: Awaited<ReturnType<typeof fetchAdminTransaction>>;
  try {
    data = await fetchAdminTransaction(id);
  } catch {
    notFound();
  }

  const tx = data.transaction as Record<string, unknown>;
  const user = data.user as Record<string, unknown> | null;
  const request = data.request as Record<string, unknown> | null;
  const deposit = data.deposit as Record<string, unknown> | null;
  const lock = data.payment_lock as Record<string, unknown> | null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/transactions" className="text-sm text-brand hover:text-brand-dark">
          ← Transactions
        </Link>
        <h2 className="mt-1 text-2xl font-semibold capitalize text-ink">
          {(tx.type as string).replaceAll('_', ' ')}
        </h2>
        <p className="text-sm text-muted">{id}</p>
        <div className="mt-2 flex gap-2">
          <StatusBadge status={tx.status as string} />
          <span className="text-sm text-muted">{formatNgnFromKobo(tx.amount as number)}</span>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-muted">User</dt>
            <dd>
              <Link href={`/wallets/${tx.user_id as string}`} className="text-brand">
                {(user?.display_name as string) ?? (tx.user_id as string)}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Created</dt>
            <dd>{format(new Date(tx.created_at as string), 'PPpp')}</dd>
          </div>
          <div>
            <dt className="text-muted">Idempotency reference</dt>
            <dd className="break-all font-mono text-xs">{tx.reference as string}</dd>
          </div>
          <div>
            <dt className="text-muted">Paystack reference</dt>
            <dd className="break-all font-mono text-xs">
              {(tx.paystack_reference as string) ?? '—'}
            </dd>
          </div>
          {tx.description ? (
            <div className="sm:col-span-2">
              <dt className="text-muted">Description</dt>
              <dd>{tx.description as string}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {request ? (
        <section className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
          <h3 className="font-semibold text-ink">Request</h3>
          <p className="mt-2">
            <Link href={`/requests/${request.id as string}`} className="text-brand">
              {request.title as string}
            </Link>
          </p>
          <p className="mt-1 capitalize text-muted">
            {(request.status as string).replaceAll('_', ' ')} · payment{' '}
            {(request.payment_status as string).replaceAll('_', ' ')}
          </p>
        </section>
      ) : null}

      {lock ? (
        <section className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
          <h3 className="font-semibold text-ink">Payment lock</h3>
          <dl className="mt-2 grid gap-2 sm:grid-cols-3">
            <div>
              <dt className="text-muted">Provider amount</dt>
              <dd>{formatNgnFromKobo(lock.provider_amount as number)}</dd>
            </div>
            <div>
              <dt className="text-muted">Service fee (10% policy)</dt>
              <dd>{formatNgnFromKobo(lock.service_fee as number)}</dd>
            </div>
            <div>
              <dt className="text-muted">Total escrow</dt>
              <dd>{formatNgnFromKobo(lock.total as number)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {deposit ? (
        <section className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
          <h3 className="font-semibold text-ink">Linked Paystack deposit</h3>
          <p className="mt-1 capitalize text-muted">
            Status {(deposit.status as string).replaceAll('_', ' ')}
          </p>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-surface p-4 text-xs text-muted">
        <p className="font-medium text-ink">Immutable ledger</p>
        <p className="mt-1">
          This row cannot be edited from the dashboard. Corrections require authorized backend
          settlement flows.
        </p>
        <pre className="mt-3 max-h-64 overflow-auto rounded bg-elevated p-2 text-subtle">
          {JSON.stringify(tx.metadata, null, 2)}
        </pre>
      </section>
    </div>
  );
}
