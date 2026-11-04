import Link from 'next/link';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';

import { StatusBadge } from '@/components/admin/status-badge';
import { RevealAccountButton } from '@/components/withdrawals/reveal-account-button';
import { WithdrawalActions } from '@/components/withdrawals/withdrawal-actions';
import { fetchWithdrawalDetail } from '@/lib/admin/withdrawals';
import { requireAdminSessionForPath } from '@/lib/admin/session';
import { formatNgnFromKobo } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function WithdrawalDetailPage({ params }: Props) {
  await requireAdminSessionForPath('/withdrawals');
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof fetchWithdrawalDetail>>;
  try {
    detail = await fetchWithdrawalDetail(id);
  } catch {
    notFound();
  }

  const withdrawal = detail.withdrawal as Record<string, unknown>;
  const auditEvents = (detail.audit_events as unknown[]) ?? [];
  const timeline = (detail.timeline as unknown[]) ?? [];
  const risk = detail.risk as Record<string, unknown>;
  const notice = detail.manual_transfer_notice as string;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/withdrawals" className="text-sm text-brand hover:text-brand-dark">
          ← Withdrawals
        </Link>
        <h2 className="mt-1 text-2xl font-semibold text-ink">Withdrawal</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={withdrawal.status as string} />
          <span className="text-lg font-medium">
            {formatNgnFromKobo(withdrawal.amount_kobo as number)}
          </span>
        </div>
        <p className="mt-2 break-all font-mono text-xs text-muted">
          {withdrawal.reference as string}
        </p>
      </div>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        {notice}
      </section>

      {risk.marketplace_listing_restricted ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          User has an active marketplace listing restriction (new requests/offers may be blocked).
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
        <h3 className="font-semibold text-ink">User</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-muted">Name</dt>
            <dd>
              <Link href={`/users/${withdrawal.user_id as string}`} className="text-brand">
                {withdrawal.user_name as string}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-muted">User ID</dt>
            <dd className="break-all font-mono text-xs">{withdrawal.user_id as string}</dd>
          </div>
          <div>
            <dt className="text-muted">Phone</dt>
            <dd>{(withdrawal.user_phone as string) ?? '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
        <h3 className="font-semibold text-ink">Destination (snapshot at submission)</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-muted">Bank</dt>
            <dd>{withdrawal.destination_bank_name as string}</dd>
          </div>
          <div>
            <dt className="text-muted">Account holder</dt>
            <dd>{withdrawal.destination_account_name as string}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Account number</dt>
            <dd className="mt-1">
              <RevealAccountButton
                withdrawalId={withdrawal.id as string}
                masked={withdrawal.destination_account_number_masked as string}
              />
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
        <h3 className="font-semibold text-ink">Timestamps</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-muted">Submitted</dt>
            <dd>{format(new Date(withdrawal.created_at as string), 'PPpp')}</dd>
          </div>
          <div>
            <dt className="text-muted">Last updated</dt>
            <dd>{format(new Date(withdrawal.updated_at as string), 'PPpp')}</dd>
          </div>
          {(withdrawal.approved_at as string) ? (
            <div>
              <dt className="text-muted">Approved for processing</dt>
              <dd>{format(new Date(withdrawal.approved_at as string), 'PPpp')}</dd>
            </div>
          ) : null}
          {(withdrawal.processing_at as string) ? (
            <div>
              <dt className="text-muted">Processing started</dt>
              <dd>{format(new Date(withdrawal.processing_at as string), 'PPpp')}</dd>
            </div>
          ) : null}
          {(withdrawal.completed_at as string) ? (
            <div>
              <dt className="text-muted">Completed</dt>
              <dd>{format(new Date(withdrawal.completed_at as string), 'PPpp')}</dd>
            </div>
          ) : null}
          {(withdrawal.rejected_at as string) ? (
            <div>
              <dt className="text-muted">Rejected</dt>
              <dd>{format(new Date(withdrawal.rejected_at as string), 'PPpp')}</dd>
            </div>
          ) : null}
          {(withdrawal.failed_at as string) ? (
            <div>
              <dt className="text-muted">Failed</dt>
              <dd>{format(new Date(withdrawal.failed_at as string), 'PPpp')}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
        <h3 className="font-semibold text-ink">Ledger references</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-muted">Reservation transaction</dt>
            <dd>
              <Link
                href={`/transactions/${withdrawal.wallet_transaction_id as string}`}
                className="break-all font-mono text-xs text-brand"
              >
                {withdrawal.wallet_transaction_id as string}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Release transaction</dt>
            <dd className="break-all font-mono text-xs">
              {withdrawal.release_transaction_id ? (
                <Link
                  href={`/transactions/${withdrawal.release_transaction_id as string}`}
                  className="text-brand"
                >
                  {withdrawal.release_transaction_id as string}
                </Link>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">External transfer reference</dt>
            <dd className="break-all font-mono text-xs">
              {(withdrawal.bank_transfer_reference as string) ?? '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
        <h3 className="font-semibold text-ink">Actions</h3>
        <div className="mt-3">
          <WithdrawalActions
            withdrawalId={withdrawal.id as string}
            status={withdrawal.status as string}
          />
        </div>
        {(withdrawal.user_facing_reason as string) ? (
          <p className="mt-4 text-muted">
            User-facing reason:{' '}
            <span className="text-ink">{withdrawal.user_facing_reason as string}</span>
          </p>
        ) : null}
        {(withdrawal.admin_notes as string) ? (
          <p className="mt-2 text-muted">
            Internal notes: <span className="text-ink">{withdrawal.admin_notes as string}</span>
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
        <h3 className="font-semibold text-ink">Timeline</h3>
        <ul className="mt-3 space-y-2">
          {timeline.length === 0 ? (
            <li className="text-muted">No timeline entries.</li>
          ) : (
            timeline.map((entry, index) => {
              const row = entry as Record<string, unknown>;
              return (
                <li key={index} className="flex flex-wrap gap-2 text-muted">
                  <span className="font-medium capitalize text-ink">{row.event as string}</span>
                  <span>·</span>
                  <span>{row.at ? format(new Date(row.at as string), 'PPpp') : '—'}</span>
                </li>
              );
            })
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
        <h3 className="font-semibold text-ink">Administrative audit</h3>
        {auditEvents.length === 0 ? (
          <p className="mt-2 text-muted">No audit events for this withdrawal yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {auditEvents.map((event) => {
              const row = event as Record<string, unknown>;
              return (
                <li key={row.id as string} className="rounded-lg bg-surface px-3 py-2">
                  <div className="font-medium text-ink">{row.action as string}</div>
                  <div className="text-xs text-muted">
                    {format(new Date(row.created_at as string), 'PPpp')}
                  </div>
                  {(row.reason as string) ? (
                    <p className="mt-1 text-sm">{row.reason as string}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
