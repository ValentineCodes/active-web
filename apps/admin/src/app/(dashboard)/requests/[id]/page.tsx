import Link from 'next/link';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';

import { StatusBadge } from '@/components/admin/status-badge';
import { requireAdminSessionForPath } from '@/lib/admin/session';
import { fetchAdminRequest } from '@/lib/admin/requests';
import { formatMoney, formatNgnFromKobo } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function RequestDetailPage({ params }: Props) {
  await requireAdminSessionForPath('/requests');
  const { id } = await params;

  let data: Awaited<ReturnType<typeof fetchAdminRequest>>;
  try {
    data = await fetchAdminRequest(id);
  } catch {
    notFound();
  }

  const request = data.request as Record<string, unknown>;
  const offers = data.offers as Array<Record<string, unknown>>;
  const events = data.status_events as Array<Record<string, unknown>>;
  const messages = data.messages as Array<Record<string, unknown>>;
  const problems = data.service_problems as Array<Record<string, unknown>>;
  const resolutions = data.admin_resolutions as Array<Record<string, unknown>>;
  const paymentLock = data.payment_lock as Record<string, unknown> | null;
  const transactions = data.wallet_transactions as Array<Record<string, unknown>> | null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/requests" className="text-sm text-brand hover:text-brand-dark">← Requests</Link>
        <h2 className="mt-1 text-2xl font-semibold text-ink">{request.title as string}</h2>
        <p className="text-sm text-muted">{id}</p>
      </div>

      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={request.status as string} />
          <StatusBadge status={request.payment_status as string} />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink">{request.description as string}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-muted">Requester</dt>
            <dd>
              <Link href={`/users/${request.requester_id as string}`} className="text-brand">
                {request.requester_name as string}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Selected provider</dt>
            <dd>
              {request.selected_user_id ? (
                <Link href={`/users/${request.selected_user_id as string}`} className="text-brand">
                  {request.provider_name as string}
                </Link>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Location</dt>
            <dd>
              {request.location_label as string}
              <p className="text-xs text-subtle">
                {request.latitude as number}, {request.longitude as number}
              </p>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Offered amount</dt>
            <dd>
              {request.offered_amount !== null
                ? formatMoney(request.offered_amount as number, request.currency as string)
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Agreed provider amount</dt>
            <dd>
              {request.agreed_provider_amount !== null
                ? formatMoney(request.agreed_provider_amount as number, request.currency as string)
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Completion confirm by</dt>
            <dd>
              {request.completion_confirm_by
                ? format(new Date(request.completion_confirm_by as string), 'PPpp')
                : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
          <h3 className="text-sm font-semibold text-ink">Provider offers</h3>
          <p className="mt-1 text-xs text-muted">
            Multiple offers are preserved; only one handshake is active per request.
          </p>
          <ul className="mt-3 divide-y divide-border">
            {offers.length === 0 ? (
              <li className="py-2 text-sm text-muted">No offers yet.</li>
            ) : (
              offers.map((offer) => (
                <li key={String(offer.id)} className="py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/users/${offer.responder_id as string}`} className="font-medium hover:text-brand">
                      {offer.responder_name as string}
                    </Link>
                    <StatusBadge status={offer.status as string} />
                  </div>
                  <p className="text-xs text-muted">
                    {offer.quoted_amount !== null
                      ? formatMoney(offer.quoted_amount as number, request.currency as string)
                      : 'No counter-offer'}
                    {' · '}
                    {format(new Date(offer.created_at as string), 'MMM d, HH:mm')}
                  </p>
                  {offer.message ? <p className="mt-1 text-muted">{offer.message as string}</p> : null}
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
          <h3 className="text-sm font-semibold text-ink">Lifecycle timeline</h3>
          <ol className="mt-3 space-y-2 text-sm">
            {events.map((event) => (
              <li key={String(event.id)} className="rounded-lg bg-surface px-3 py-2">
                <p className="font-medium">
                  {event.from_status as string} → {event.to_status as string}
                </p>
                <p className="text-xs text-muted">
                  {format(new Date(event.created_at as string), 'PPpp')}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Conversation</h3>
        <p className="mt-1 text-xs text-muted">
          Includes pre- and post-acceptance messages for this request conversation.
        </p>
        <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto text-sm">
          {messages.length === 0 ? (
            <li className="text-muted">No messages.</li>
          ) : (
            messages.map((message) => (
              <li key={String(message.id)} className="rounded-lg bg-surface px-3 py-2">
                <p className="text-xs font-medium text-muted">{message.sender_name as string}</p>
                <p>{message.body as string}</p>
                <p className="mt-1 text-xs text-subtle">
                  {format(new Date(message.created_at as string), 'PPpp')}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
          <h3 className="text-sm font-semibold text-ink">Service problem reports</h3>
          <ul className="mt-2 divide-y divide-border text-sm">
            {problems.length === 0 ? (
              <li className="py-2 text-muted">No reports.</li>
            ) : (
              problems.map((problem) => (
                <li key={String(problem.id)} className="py-2">
                  <p className="font-medium capitalize">{(problem.kind as string).replaceAll('_', ' ')}</p>
                  <p className="text-xs text-muted">
                    {problem.status as string}
                    {problem.resolution ? ` · ${problem.resolution as string}` : ''}
                  </p>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
          <h3 className="text-sm font-semibold text-ink">Administrative interventions</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {resolutions.length === 0 ? (
              <li className="text-muted">No dispute admin resolutions recorded.</li>
            ) : (
              resolutions.map((row) => (
                <li key={String(row.id)} className="rounded-lg bg-surface px-3 py-2">
                  <p className="font-medium">{row.outcome as string}</p>
                  <p className="text-muted">{row.admin_note as string}</p>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {paymentLock || transactions ? (
        <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
          <h3 className="text-sm font-semibold text-ink">Financial records</h3>
          {paymentLock ? (
            <p className="mt-2 text-sm text-muted">
              Lock {paymentLock.status as string} · total {formatNgnFromKobo(paymentLock.total as number)} (provider{' '}
              {formatNgnFromKobo(paymentLock.provider_amount as number)}, fee{' '}
              {formatNgnFromKobo(paymentLock.service_fee as number)})
            </p>
          ) : null}
          {transactions && transactions.length > 0 ? (
            <ul className="mt-3 divide-y divide-border text-sm">
              {transactions.map((tx) => (
                <li key={String(tx.id)} className="flex justify-between py-2">
                  <span className="capitalize">{(tx.type as string).replaceAll('_', ' ')}</span>
                  <span className="tabular-nums">{formatNgnFromKobo(tx.amount as number)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No wallet transactions linked to this request.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
