import Link from 'next/link';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';

import { StatusBadge } from '@/components/admin/status-badge';
import { fetchAdminTransaction } from '@/lib/admin/finance';
import { requireAdminSessionForPath } from '@/lib/admin/session';
import { formatNgnFromKobo } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function WithdrawalDetailPage({ params }: Props) {
  await requireAdminSessionForPath('/withdrawals');
  const { id } = await params;

  let data: Awaited<ReturnType<typeof fetchAdminTransaction>>;
  try {
    data = await fetchAdminTransaction(id);
  } catch {
    notFound();
  }

  const tx = data.transaction as Record<string, unknown>;
  if (tx.type !== 'withdrawal') {
    notFound();
  }

  const user = data.user as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/withdrawals" className="text-sm text-brand hover:text-brand-dark">← Withdrawals</Link>
        <h2 className="mt-1 text-2xl font-semibold text-ink">Withdrawal</h2>
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge status={tx.status as string} />
          <span>{formatNgnFromKobo(tx.amount as number)}</span>
        </div>
      </div>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        Read-only inspection. Marking success from the dashboard is intentionally unsupported. Verify payout state via
        Paystack and service_role settlement jobs.
      </section>

      <section className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-muted">User</dt>
            <dd>
              <Link href={`/wallets/${tx.user_id as string}`} className="text-brand">
                {user.display_name as string}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Created</dt>
            <dd>{format(new Date(tx.created_at as string), 'PPpp')}</dd>
          </div>
          <div>
            <dt className="text-muted">Reference</dt>
            <dd className="break-all font-mono text-xs">{tx.reference as string}</dd>
          </div>
          <div>
            <dt className="text-muted">Paystack / provider reference</dt>
            <dd className="break-all font-mono text-xs">{(tx.paystack_reference as string) ?? '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Failure / notes</dt>
            <dd>{(tx.description as string) ?? '—'}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted">
          Bank destination details are not stored in a dedicated table in this schema; check metadata when present.
        </p>
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-surface p-2 text-xs text-subtle">
          {JSON.stringify(tx.metadata, null, 2)}
        </pre>
      </section>

      <Link href={`/transactions/${id}`} className="text-sm text-brand">Open full ledger entry →</Link>
    </div>
  );
}
