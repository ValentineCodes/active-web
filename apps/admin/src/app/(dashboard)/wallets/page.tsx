import Link from 'next/link';
import { Suspense } from 'react';
import { format } from 'date-fns';

import { ListPagination } from '@/components/admin/pagination';
import { ListToolbar } from '@/components/admin/list-toolbar';
import { fetchAdminWallets } from '@/lib/admin/finance';
import { requireAdminSessionForPath } from '@/lib/admin/session';
import { formatNgnFromKobo } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WalletsPage({ searchParams }: Props) {
  await requireAdminSessionForPath('/wallets');
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q : '';
  const limit = Math.min(100, Math.max(1, Number(params.limit ?? 25) || 25));
  const offset = Math.max(0, Number(params.offset ?? 0) || 0);

  const result = await fetchAdminWallets({ query, limit, offset });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Wallets</h2>
        <p className="mt-1 text-sm text-muted">
          Server-authoritative balances in kobo. Locked engagement funds are committed at provider acceptance via payment locks.
        </p>
      </div>

      <Suspense fallback={<div className="h-12 animate-pulse rounded-lg bg-border" />}>
        <ListToolbar basePath="/wallets" searchPlaceholder="Search user name or id" />
      </Suspense>

      <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Available</th>
                <th className="px-4 py-3 font-medium">Locked (stored)</th>
                <th className="px-4 py-3 font-medium">Pending escrow</th>
                <th className="px-4 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {result.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">No wallets found.</td>
                </tr>
              ) : (
                result.items.map((row) => {
                  const wallet = row as Record<string, unknown>;
                  return (
                    <tr key={wallet.user_id as string} className="border-b border-border/70 last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`/wallets/${wallet.user_id as string}`} className="font-medium text-brand">
                          {wallet.user_name as string}
                        </Link>
                        <p className="text-xs text-subtle">{(wallet.user_id as string).slice(0, 8)}…</p>
                      </td>
                      <td className="px-4 py-3">{formatNgnFromKobo(wallet.available_kobo as number)}</td>
                      <td className="px-4 py-3">{formatNgnFromKobo(wallet.locked_balance_kobo as number)}</td>
                      <td className="px-4 py-3">{formatNgnFromKobo(wallet.pending_kobo as number)}</td>
                      <td className="px-4 py-3 text-muted">
                        {format(new Date(wallet.updated_at as string), 'PP')}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <ListPagination
            basePath="/wallets"
            searchParams={{ q: query || undefined }}
            total={result.total}
            limit={limit}
            offset={offset}
          />
        </div>
      </div>

      <p className="text-xs text-muted">
        Balance corrections are not available in this UI. There is no admin adjustment RPC; use service_role settlement tooling only.
      </p>
    </div>
  );
}
