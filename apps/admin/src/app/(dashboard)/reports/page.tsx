import Link from 'next/link';
import { Suspense } from 'react';
import { format } from 'date-fns';

import { ListPagination } from '@/components/admin/pagination';
import { ListToolbar } from '@/components/admin/list-toolbar';
import { StatusBadge } from '@/components/admin/status-badge';
import { REPORT_KIND_LABELS, REPORT_QUEUE_FILTERS, fetchAdminReports } from '@/lib/admin/reports';
import { requireAdminSessionForPath } from '@/lib/admin/session';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReportsPage({ searchParams }: Props) {
  await requireAdminSessionForPath('/reports');
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q : '';
  const filter = typeof params.filter === 'string' ? params.filter : 'all';
  const limit = Math.min(100, Math.max(1, Number(params.limit ?? 25) || 25));
  const offset = Math.max(0, Number(params.offset ?? 0) || 0);

  const result = await fetchAdminReports({ query, filter, limit, offset });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Reports</h2>
        <p className="mt-1 text-sm text-muted">
          Service problems filed through the mobile Report flow. Opening a report does not refund,
          pay, or cancel engagements automatically.
        </p>
      </div>

      <Suspense fallback={<div className="h-12 animate-pulse rounded-lg bg-border" />}>
        <ListToolbar
          basePath="/reports"
          searchPlaceholder="Search report id, request, or user name"
          filterOptions={[...REPORT_QUEUE_FILTERS]}
        />
      </Suspense>

      <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Queue</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Reporter</th>
                <th className="px-4 py-3 font-medium">Request</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">
                    No reports match your filters.
                  </td>
                </tr>
              ) : (
                result.items.map((report) => (
                  <tr key={report.id} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-3 text-muted">
                      <Link
                        href={`/reports/${report.id}`}
                        className="font-medium text-ink hover:text-brand"
                      >
                        {format(new Date(report.created_at), 'PP')}
                      </Link>
                      <p className="text-xs text-subtle">{report.id.slice(0, 8)}…</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={report.queue_label} />
                    </td>
                    <td className="px-4 py-3">
                      <p>{REPORT_KIND_LABELS[report.kind] ?? report.kind}</p>
                      <p className="line-clamp-2 text-xs text-muted">{report.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/users/${report.reported_by}`} className="text-brand">
                        {report.reporter_name ?? 'User'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/requests/${report.request_id}`} className="text-brand">
                        {report.request_title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {report.provider_id ? (
                        <Link href={`/users/${report.provider_id}`} className="text-brand">
                          {report.provider_name ?? 'Provider'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={report.status} />
                      {report.resolution ? (
                        <p className="mt-1 text-xs capitalize text-subtle">
                          {report.resolution.replaceAll('_', ' ')}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <ListPagination
            basePath="/reports"
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
