import Link from 'next/link';
import { Suspense } from 'react';
import { format } from 'date-fns';

import { ListPagination } from '@/components/admin/pagination';
import { ListToolbar } from '@/components/admin/list-toolbar';
import { StatusBadge } from '@/components/admin/status-badge';
import { requireAdminSessionForPath } from '@/lib/admin/session';
import { fetchAdminUsers } from '@/lib/admin/users';
import { formatCount } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

const USER_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'onboarded', label: 'Onboarded' },
  { value: 'not_onboarded', label: 'Incomplete profile' },
  { value: 'restricted', label: 'Restricted' },
];

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UsersPage({ searchParams }: Props) {
  await requireAdminSessionForPath('/users');
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q : '';
  const filter = typeof params.filter === 'string' ? params.filter : 'all';
  const limit = Math.min(100, Math.max(1, Number(params.limit ?? 25) || 25));
  const offset = Math.max(0, Number(params.offset ?? 0) || 0);

  const result = await fetchAdminUsers({ query, filter, limit, offset });

  return (
    <div className="space-y-4">
      <Suspense fallback={<div className="h-12 animate-pulse rounded-lg bg-border" />}>
        <ListToolbar
          basePath="/users"
          searchPlaceholder="Search name, user id, or phone"
          filterOptions={USER_FILTERS}
        />
      </Suspense>

      <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Registered</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Requests</th>
                <th className="px-4 py-3 font-medium">Engagements</th>
                <th className="px-4 py-3 font-medium">Reports filed</th>
              </tr>
            </thead>
            <tbody>
              {result.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">
                    No users match your search.
                  </td>
                </tr>
              ) : (
                result.items.map((user) => (
                  <tr key={user.id} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/users/${user.id}`}
                        className="font-medium text-ink hover:text-brand"
                      >
                        {user.display_name ?? 'Unnamed user'}
                      </Link>
                      <p className="text-xs text-subtle">{user.id.slice(0, 8)}…</p>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {user.phone ?? '—'}
                      {user.phone ? (
                        <p className="text-xs text-subtle">
                          {user.phone_confirmed ? 'Verified' : 'Unverified'}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {format(new Date(user.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.is_restricted ? <StatusBadge status="restricted" /> : null}
                        <StatusBadge status={user.is_onboarded ? 'onboarded' : 'draft'} />
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatCount(user.requests_posted_count)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatCount(user.engagements_as_provider_count)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatCount(user.reports_filed_count)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <ListPagination
            basePath="/users"
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
