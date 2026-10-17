import Link from 'next/link';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';

import { fetchAuditEvent } from '@/lib/admin/audit';
import { requireAdminSessionForPath } from '@/lib/admin/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function AuditEventDetailPage({ params }: Props) {
  await requireAdminSessionForPath('/audit-logs');
  const { id } = await params;

  let data: Awaited<ReturnType<typeof fetchAuditEvent>>;
  try {
    data = await fetchAuditEvent(id);
  } catch {
    notFound();
  }

  const event = data.event as Record<string, unknown>;
  const actor = data.actor as Record<string, unknown> | null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/audit-logs" className="text-sm text-brand hover:text-brand-dark">← Audit logs</Link>
        <h2 className="mt-1 text-2xl font-semibold text-ink">{event.action as string}</h2>
        <p className="text-sm text-muted">{format(new Date(event.created_at as string), 'PPpp')}</p>
      </div>

      <section className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-muted">Actor</dt>
            <dd>{(actor?.email as string) ?? (event.actor_admin_id as string)}</dd>
          </div>
          <div>
            <dt className="text-muted">Role</dt>
            <dd className="capitalize">{((actor?.role as string) ?? '—').replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt className="text-muted">Target</dt>
            <dd>{event.entity_type as string} {event.entity_id ? `· ${event.entity_id as string}` : ''}</dd>
          </div>
          <div>
            <dt className="text-muted">Correlation id</dt>
            <dd className="font-mono text-xs break-all">{event.correlation_id as string}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Reason</dt>
            <dd>{(event.reason as string) ?? '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink">Metadata (redacted)</h3>
        <pre className="mt-2 max-h-96 overflow-auto text-xs text-subtle">
          {JSON.stringify(event.metadata, null, 2)}
        </pre>
      </section>
    </div>
  );
}
