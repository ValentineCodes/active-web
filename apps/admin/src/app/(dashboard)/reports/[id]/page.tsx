import Link from 'next/link';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';

import { StatusBadge } from '@/components/admin/status-badge';
import { ReportActions } from '@/components/reports/report-actions';
import { ReportEvidence } from '@/components/reports/report-evidence';
import { REPORT_KIND_LABELS, fetchAdminReport } from '@/lib/admin/reports';
import { requireAdminSessionForPath } from '@/lib/admin/session';
import { formatMoney, formatNgnFromKobo } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function ReportDetailPage({ params }: Props) {
  const session = await requireAdminSessionForPath('/reports');
  const { id } = await params;

  let data: Awaited<ReturnType<typeof fetchAdminReport>>;
  try {
    data = await fetchAdminReport(id);
  } catch {
    notFound();
  }

  const report = data.report as Record<string, unknown>;
  const request = data.request as Record<string, unknown>;
  const parties = data.parties as Array<Record<string, unknown>>;
  const messages = data.messages as Array<Record<string, unknown>>;
  const events = data.status_events as Array<Record<string, unknown>>;
  const related = data.related_reports as Array<Record<string, unknown>>;
  const resolutions = data.admin_resolutions as Array<Record<string, unknown>>;
  const notes = data.notes as Array<Record<string, unknown>>;
  const audit = data.audit_events as Array<Record<string, unknown>>;
  const assignableAdmins = data.assignable_admins as Array<{
    user_id: string;
    email: string | null;
  }>;
  const paymentLock = data.payment_lock as Record<string, unknown> | null;
  const transactions = data.wallet_transactions as Array<Record<string, unknown>> | null;
  const evidencePaths = (report.evidence_paths as string[]) ?? [];

  const reporterId = report.reported_by as string;
  const counterpartyUserId =
    reporterId === (request.requester_id as string)
      ? (request.provider_id as string | null)
      : (request.requester_id as string);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-brand hover:text-brand-dark">
          ← Reports
        </Link>
        <h2 className="mt-1 text-2xl font-semibold text-ink">
          {REPORT_KIND_LABELS[report.kind as string] ?? (report.kind as string)}
        </h2>
        <p className="text-sm text-muted">{id}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusBadge status={report.queue_label as string} />
          <StatusBadge status={report.status as string} />
          {report.resolution ? <StatusBadge status={report.resolution as string} /> : null}
        </div>
      </div>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-medium">User allegation</p>
        <p className="mt-2 whitespace-pre-wrap">{report.description as string}</p>
        <p className="mt-2 text-xs text-amber-900/80">
          Submitted {format(new Date(report.created_at as string), 'PPpp')}
          {report.respond_by
            ? ` · Counterparty may respond until ${format(new Date(report.respond_by as string), 'PPpp')}`
            : ''}
        </p>
      </section>

      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Submitted evidence</h3>
        <p className="mt-1 text-xs text-muted">
          User-submitted photos. Access is logged for administrators.
        </p>
        <div className="mt-3">
          <ReportEvidence paths={evidencePaths} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
          <h3 className="text-sm font-semibold text-ink">Request context</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-muted">Request</dt>
              <dd>
                <Link href={`/requests/${request.id as string}`} className="text-brand">
                  {request.title as string}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-muted">Engagement status</dt>
              <dd className="capitalize">{(request.status as string).replaceAll('_', ' ')}</dd>
            </div>
            <div>
              <dt className="text-muted">Payment</dt>
              <dd className="capitalize">
                {(request.payment_status as string).replaceAll('_', ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Location</dt>
              <dd>{request.location_label as string}</dd>
            </div>
            <div>
              <dt className="text-muted">Amounts</dt>
              <dd>
                Offered{' '}
                {request.offered_amount !== null
                  ? formatMoney(request.offered_amount as number, request.currency as string)
                  : '—'}
                {request.agreed_provider_amount !== null
                  ? ` · Agreed ${formatMoney(request.agreed_provider_amount as number, request.currency as string)}`
                  : ''}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
          <h3 className="text-sm font-semibold text-ink">Parties</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {parties.map((party) => (
              <li key={party.id as string} className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/users/${party.id as string}`} className="font-medium text-brand">
                    {party.display_name as string}
                  </Link>
                  <p className="text-xs capitalize text-muted">{party.role as string}</p>
                </div>
                {party.phone ? (
                  <p className="text-xs text-muted">
                    {party.phone as string}
                    {party.phone_confirmed ? ' · verified' : ''}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Investigation</h3>
        <ReportActions
          reportId={id}
          isOpen={report.status === 'open'}
          assignedAdminId={report.assigned_admin_id as string | null}
          assignableAdmins={assignableAdmins}
          canRestrictUsers={session.permissions.users}
          counterpartyUserId={counterpartyUserId}
        />
      </section>

      {paymentLock || transactions ? (
        <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
          <h3 className="text-sm font-semibold text-ink">Financial records</h3>
          {paymentLock ? (
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Escrow status</dt>
                <dd className="capitalize">
                  {(paymentLock.status as string).replaceAll('_', ' ')}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Provider amount</dt>
                <dd>{formatNgnFromKobo(paymentLock.provider_amount as number)}</dd>
              </div>
            </dl>
          ) : null}
          {transactions && transactions.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {transactions.map((tx) => (
                <li
                  key={tx.id as string}
                  className="flex justify-between gap-2 border-b border-border/60 py-1"
                >
                  <span className="capitalize text-muted">
                    {(tx.type as string).replaceAll('_', ' ')} ·{' '}
                    {(tx.status as string).replaceAll('_', ' ')}
                  </span>
                  <span>{formatNgnFromKobo(tx.amount as number)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No wallet transactions on this request.</p>
          )}
        </section>
      ) : (
        <p className="text-sm text-muted">
          Financial details require a finance-enabled administrator role.
        </p>
      )}

      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Request chat</h3>
        <p className="mt-1 text-xs text-muted">Participant messages on the request conversation.</p>
        <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto text-sm">
          {messages.length === 0 ? (
            <li className="text-muted">No messages.</li>
          ) : (
            messages.map((message) => (
              <li key={message.id as string} className="rounded-lg bg-surface px-3 py-2">
                <p className="text-xs text-muted">
                  {message.sender_name as string} ·{' '}
                  {format(new Date(message.created_at as string), 'PPp')}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{message.body as string}</p>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Status timeline</h3>
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {events.map((event) => (
            <li key={event.id as string}>
              {format(new Date(event.created_at as string), 'PPp')} —{' '}
              {(event.from_status as string).replaceAll('_', ' ')} →{' '}
              {(event.to_status as string).replaceAll('_', ' ')}
            </li>
          ))}
        </ul>
      </section>

      {related.length > 0 ? (
        <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
          <h3 className="text-sm font-semibold text-ink">Other reports on this request</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {related.map((item) => (
              <li key={item.id as string}>
                <Link href={`/reports/${item.id as string}`} className="text-brand">
                  {REPORT_KIND_LABELS[item.kind as string] ?? (item.kind as string)} ·{' '}
                  {item.status as string}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Internal notes</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {notes.length === 0 ? (
            <li className="text-muted">No internal notes yet.</li>
          ) : (
            notes.map((item) => (
              <li
                key={item.id as string}
                className="rounded-lg border border-border bg-surface px-3 py-2"
              >
                <p className="text-xs text-muted">
                  {format(new Date(item.created_at as string), 'PPpp')}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{item.body as string}</p>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Resolution history</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {resolutions.length === 0 ? (
            <li className="text-muted">No administrative resolution recorded.</li>
          ) : (
            resolutions.map((item) => (
              <li
                key={item.id as string}
                className="rounded-lg border border-border bg-surface px-3 py-2"
              >
                <p className="font-medium capitalize">
                  {(item.outcome as string).replaceAll('_', ' ')}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {format(new Date(item.created_at as string), 'PPpp')}
                </p>
                <p className="mt-2 whitespace-pre-wrap">{item.admin_note as string}</p>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Administrative audit</h3>
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {audit.map((item) => (
            <li key={item.id as string}>
              {format(new Date(item.created_at as string), 'PPp')} · {item.action as string}
              {item.reason ? ` — ${item.reason as string}` : ''}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
