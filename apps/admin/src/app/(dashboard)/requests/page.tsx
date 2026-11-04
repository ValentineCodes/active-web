import Link from 'next/link';
import { Suspense } from 'react';
import { format } from 'date-fns';

import { ListPagination } from '@/components/admin/pagination';
import { ListToolbar } from '@/components/admin/list-toolbar';
import { StatusBadge } from '@/components/admin/status-badge';
import { requireAdminSessionForPath } from '@/lib/admin/session';
import { fetchAdminRequests } from '@/lib/admin/requests';
import { formatMoney } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

const REQUEST_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'disputed', label: 'Disputed' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed', label: 'Closed' },
];

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RequestsPage({ searchParams }: Props) {
  await requireAdminSessionForPath('/requests');
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q : '';
  const statusGroup =
    typeof params.status === 'string'
      ? params.status
      : typeof params.filter === 'string'
        ? params.filter
        : 'all';
  const limit = Math.min(100, Math.max(1, Number(params.limit ?? 25) || 25));
  const offset = Math.max(0, Number(params.offset ?? 0) || 0);

  const result = await fetchAdminRequests({
    query,
    statusGroup,
    limit,
    offset,
  });

  return (
    <div className="space-y-4">
      <Suspense fallback={<div className="h-12 animate-pulse rounded-lg bg-border" />}>
        <ListToolbar
          basePath="/requests"
          searchPlaceholder="Search title, request id, or requester"
          filterOptions={REQUEST_FILTERS}
          filterParam="status"
        />
      </Suspense>

      <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Request</th>
                <th className="px-4 py-3 font-medium">Requester</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Offer</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Offers</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {result.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    No requests match your filters.
                  </td>
                </tr>
              ) : (
                result.items.map((request) => (
                  <tr key={request.id} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/requests/${request.id}`}
                        className="font-medium text-ink hover:text-brand"
                      >
                        {request.title}
                      </Link>
                      <p className="line-clamp-1 text-xs text-subtle">
                        {request.description_preview}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/users/${request.requester_id}`} className="hover:text-brand">
                        {request.requester_name ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{request.location_label}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {request.offered_amount !== null
                        ? formatMoney(request.offered_amount, request.currency)
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={request.status} />
                        <span className="text-xs text-subtle">{request.payment_status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {request.pending_offer_count}/{request.offer_count}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {format(new Date(request.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {request.expires_at
                        ? format(new Date(request.expires_at), 'MMM d, HH:mm')
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <ListPagination
            basePath="/requests"
            searchParams={{
              q: query || undefined,
              status: statusGroup === 'all' ? undefined : statusGroup,
            }}
            total={result.total}
            limit={limit}
            offset={offset}
          />
        </div>
      </div>
    </div>
  );
}
