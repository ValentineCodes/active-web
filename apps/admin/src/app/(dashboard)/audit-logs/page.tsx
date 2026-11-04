import Link from 'next/link';
import { Suspense } from 'react';
import { format } from 'date-fns';

import { ListPagination } from '@/components/admin/pagination';
import { ListToolbar } from '@/components/admin/list-toolbar';
import { AUDIT_ENTITY_FILTERS, fetchAuditEvents } from '@/lib/admin/audit';
import { requireAdminSessionForPath } from '@/lib/admin/session';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuditLogsPage({ searchParams }: Props) {
  await requireAdminSessionForPath('/audit-logs');
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q : '';
  const filter = typeof params.filter === 'string' ? params.filter : 'all';
  const limit = Math.min(100, Math.max(1, Number(params.limit ?? 50) || 50));
  const offset = Math.max(0, Number(params.offset ?? 0) || 0);

  const result = await fetchAuditEvents({
    query,
    action: 'all',
    entityType: filter,
    limit,
    offset,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Audit logs</h2>
        <p className="mt-1 text-sm text-muted">
          Immutable administrator actions stored in{' '}
          <code className="text-xs">admin_audit_events</code> (Super Admin only). Secrets in
          metadata are redacted at read time.
        </p>
      </div>

      <Suspense fallback={<div className="h-12 animate-pulse rounded-lg bg-border" />}>
        <ListToolbar
          basePath="/audit-logs"
          searchPlaceholder="Search action, actor email, entity id, correlation id"
          filterOptions={[...AUDIT_ENTITY_FILTERS]}
        />
      </Suspense>

      <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {result.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    No audit events found.
                  </td>
                </tr>
              ) : (
                result.items.map((event) => (
                  <tr key={event.id} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/audit-logs/${event.id}`} className="text-brand">
                        {format(new Date(event.created_at), 'PPp')}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{event.action}</td>
                    <td className="px-4 py-3">
                      <p>{event.actor_email ?? event.actor_admin_id.slice(0, 8)}</p>
                      <p className="text-xs capitalize text-muted">
                        {event.actor_role?.replaceAll('_', ' ') ?? '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {event.entity_type}
                      {event.entity_id ? ` · ${event.entity_id.slice(0, 8)}…` : ''}
                    </td>
                    <td className="px-4 py-3 text-muted">{event.reason ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <ListPagination
            basePath="/audit-logs"
            searchParams={{ q: query || undefined, filter: filter === 'all' ? undefined : filter }}
            total={result.total}
            limit={limit}
            offset={offset}
          />
        </div>
      </div>
    </div>
  );
}
