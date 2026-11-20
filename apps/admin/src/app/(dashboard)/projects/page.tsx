import Link from 'next/link';
import { Suspense } from 'react';
import { format } from 'date-fns';

import { ListPagination } from '@/components/admin/pagination';
import { ListToolbar } from '@/components/admin/list-toolbar';
import { StatusBadge } from '@/components/admin/status-badge';
import { requireAdminSessionForPath } from '@/lib/admin/session';
import { fetchAdminProjects } from '@/lib/admin/projects';
import { formatNgnFromKobo } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

const PROJECT_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'open_funding', label: 'Open funding' },
  { value: 'unsuccessful', label: 'Funding unsuccessful' },
];

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProjectsPage({ searchParams }: Props) {
  await requireAdminSessionForPath('/projects');
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q : '';
  const filter =
    typeof params.filter === 'string' && PROJECT_FILTERS.some((f) => f.value === params.filter)
      ? params.filter
      : 'all';
  const limit = Math.min(100, Math.max(1, Number(params.limit ?? 25) || 25));
  const offset = Math.max(0, Number(params.offset ?? 0) || 0);

  const result = await fetchAdminProjects({ query, filter, limit, offset });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Projects</h2>
        <p className="text-sm text-muted">
          Funding pool, assignments, and disputes (read-only oversight; contributor refunds await
          UD-19).
        </p>
      </div>

      <Suspense fallback={<div className="h-12 animate-pulse rounded-lg bg-border" />}>
        <ListToolbar
          basePath="/projects"
          searchPlaceholder="Search title or project id"
          filterOptions={PROJECT_FILTERS}
        />
      </Suspense>

      <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Creator</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Funding</th>
                <th className="px-4 py-3 font-medium">Budget</th>
                <th className="px-4 py-3 font-medium">Contributed</th>
                <th className="px-4 py-3 font-medium">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${item.id}`} className="font-medium text-brand">
                      {item.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/users/${item.creator_id}`} className="text-brand">
                      {item.creator_name ?? '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.funding_status} />
                  </td>
                  <td className="px-4 py-3">{formatNgnFromKobo(item.budget_total_kobo)}</td>
                  <td className="px-4 py-3">{formatNgnFromKobo(item.contributed_total_kobo)}</td>
                  <td className="px-4 py-3 text-muted">
                    {item.funding_deadline_at
                      ? format(new Date(item.funding_deadline_at), 'PP')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ListPagination
          basePath="/projects"
          searchParams={{
            q: query || undefined,
            filter: filter === 'all' ? undefined : filter,
          }}
          total={result.total}
          limit={limit}
          offset={offset}
        />
      </div>
    </div>
  );
}