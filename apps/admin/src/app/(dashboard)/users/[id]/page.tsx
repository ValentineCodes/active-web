import Link from 'next/link';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';

import { StatusBadge } from '@/components/admin/status-badge';
import { UserAdminActions } from '@/components/users/user-actions';
import { requireAdminSessionForPath } from '@/lib/admin/session';
import { fetchAdminUser } from '@/lib/admin/users';
import { formatCount, formatNgnFromKobo } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function UserDetailPage({ params }: Props) {
  await requireAdminSessionForPath('/users');
  const { id } = await params;

  let data: Awaited<ReturnType<typeof fetchAdminUser>>;
  try {
    data = await fetchAdminUser(id);
  } catch {
    notFound();
  }

  const profile = data.profile as Record<string, unknown>;
  const counts = data.counts as Record<string, number>;
  const activeRestriction = data.active_restriction as Record<string, unknown> | null;
  const wallet = data.wallet as Record<string, number> | null;
  const isRestricted = Boolean(activeRestriction);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/users" className="text-sm text-brand hover:text-brand-dark">← Users</Link>
          <h2 className="mt-1 text-2xl font-semibold text-ink">
            {(profile.display_name as string) ?? 'Unnamed user'}
          </h2>
          <p className="text-sm text-muted">{id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isRestricted ? <StatusBadge status="restricted" /> : null}
          <StatusBadge status={(profile.is_onboarded as boolean) ? 'onboarded' : 'draft'} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-elevated p-4 shadow-card lg:col-span-2">
          <h3 className="text-sm font-semibold text-ink">Profile</h3>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Registered</dt>
              <dd>{format(new Date(profile.created_at as string), 'PPpp')}</dd>
            </div>
            <div>
              <dt className="text-muted">Phone</dt>
              <dd>
                {(profile.phone as string) ?? 'Hidden for your role'}
                {profile.phone ? (
                  <span className="ml-2 text-xs text-subtle">
                    {(profile.phone_confirmed as boolean) ? 'verified' : 'unverified'}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Ratings</dt>
              <dd>
                {profile.rating_average != null ? String(profile.rating_average) : '—'} (
                {formatCount(profile.rating_count as number)} reviews)
              </dd>
            </div>
            <div>
              <dt className="text-muted">Completions</dt>
              <dd>
                {formatCount(profile.jobs_completed as number)} jobs ·{' '}
                {formatCount(profile.requests_completed as number)} requests
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted">Bio</dt>
              <dd>{(profile.bio as string) ?? '—'}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-subtle">
            Verification is phone OTP via Supabase Auth. No identity-document storage exists in this schema.
          </p>
        </section>

        <UserAdminActions userId={id} isRestricted={isRestricted} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {Object.entries(counts).map(([key, value]) => (
          <div key={key} className="rounded-xl border border-border bg-elevated p-4 shadow-card">
            <p className="text-xs uppercase tracking-wide text-muted">{key.replaceAll('_', ' ')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCount(value)}</p>
          </div>
        ))}
      </div>

      {wallet ? (
        <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
          <h3 className="text-sm font-semibold text-ink">Wallet summary</h3>
          <p className="mt-2 text-sm text-muted">
            Available {formatNgnFromKobo(wallet.available_balance_kobo)} · Locked{' '}
            {formatNgnFromKobo(wallet.locked_balance_kobo)}
          </p>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <HistoryTable title="Requests" rows={data.requests as Array<Record<string, unknown>>} linkKey="id" />
        <HistoryTable title="Engagements" rows={data.engagements as Array<Record<string, unknown>>} linkKey="id" />
        <HistoryTable title="Offers submitted" rows={data.responses as Array<Record<string, unknown>>} linkKey="request_id" />
        <HistoryTable title="Reports" rows={data.reports as Array<Record<string, unknown>>} linkKey="request_id" />
      </div>

      <NotesAndAudit
        notes={data.notes as Array<Record<string, unknown>>}
        audit={data.audit_events as Array<Record<string, unknown>>}
      />
    </div>
  );
}

function HistoryTable({
  title,
  rows,
  linkKey,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  linkKey: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">None recorded.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {rows.map((row) => (
            <li key={String(row.id ?? row.request_id)} className="py-2 text-sm">
              <Link
                href={`/requests/${String(row[linkKey] ?? row.id)}`}
                className="font-medium text-ink hover:text-brand"
              >
                {(row.title as string) ?? `Request ${String(row.request_id).slice(0, 8)}`}
              </Link>
              <p className="text-xs text-muted">
                {(row.status as string) ?? '—'}
                {row.created_at ? ` · ${format(new Date(row.created_at as string), 'MMM d, yyyy')}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NotesAndAudit({
  notes,
  audit,
}: {
  notes: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Internal notes</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {notes.length === 0 ? (
            <li className="text-muted">No notes yet.</li>
          ) : (
            notes.map((note) => (
              <li key={String(note.id)} className="rounded-lg bg-surface px-3 py-2">
                <p>{note.body as string}</p>
                <p className="mt-1 text-xs text-muted">
                  {format(new Date(note.created_at as string), 'PPpp')}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>
      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Administrative audit</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {audit.length === 0 ? (
            <li className="text-muted">No audit events for this user.</li>
          ) : (
            audit.map((event) => (
              <li key={String(event.id)} className="rounded-lg bg-surface px-3 py-2">
                <p className="font-medium">{event.action as string}</p>
                {event.reason ? <p className="text-muted">{event.reason as string}</p> : null}
                <p className="mt-1 text-xs text-subtle">
                  {format(new Date(event.created_at as string), 'PPpp')}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
