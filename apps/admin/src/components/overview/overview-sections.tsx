import Link from 'next/link';
import { format } from 'date-fns';

import type {
  OverviewPayload,
  OverviewRecentEngagement,
  OverviewRecentFinancial,
  OverviewRecentReport,
  OverviewRecentRequest,
  OverviewWarning,
} from '@/lib/overview/types';
import { formatNgnFromKobo } from '@/lib/format/money';
import { cn } from '@/lib/cn';

function SectionCard({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-elevated shadow-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {href ? (
          <Link href={href} className="text-xs font-semibold text-brand hover:text-brand-dark">
            View all
          </Link>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <p className="text-sm text-muted">{message}</p>;
}

export function OverviewWarnings({ warnings }: { warnings: OverviewWarning[] }) {
  if (warnings.length === 0) {
    return (
      <SectionCard title="Operational warnings">
        <EmptyRow message="No active warnings right now." />
      </SectionCard>
    );
  }

  const severityClass: Record<OverviewWarning['severity'], string> = {
    high: 'border-red-200 bg-red-50 text-red-900',
    medium: 'border-amber-200 bg-amber-50 text-amber-950',
    low: 'border-slate-200 bg-slate-50 text-slate-800',
  };

  return (
    <SectionCard title="Operational warnings" href="/operational-issues">
      <ul className="space-y-2">
        {warnings.map((warning) => (
          <li key={warning.code}>
            <Link
              href={warning.href}
              className={cn(
                'block rounded-lg border px-3 py-2 text-sm transition-opacity hover:opacity-90',
                severityClass[warning.severity],
              )}
            >
              {warning.message}
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function OverviewRecentRequests({ rows }: { rows: OverviewRecentRequest[] }) {
  return (
    <SectionCard title="Recent requests" href="/requests">
      {rows.length === 0 ? (
        <EmptyRow message="No requests yet." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <Link
                  href={`/requests?id=${row.id}`}
                  className="truncate font-medium text-ink hover:text-brand"
                >
                  {row.title}
                </Link>
                <p className="text-xs text-muted">
                  {format(new Date(row.created_at), 'MMM d, HH:mm')}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">
                {row.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function OverviewRecentEngagements({ rows }: { rows: OverviewRecentEngagement[] }) {
  return (
    <SectionCard title="Recent engagements" href="/requests?filter=engagements">
      {rows.length === 0 ? (
        <EmptyRow message="No engagements yet." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li
              key={row.request_id}
              className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <Link
                  href={`/requests?id=${row.request_id}`}
                  className="truncate font-medium text-ink hover:text-brand"
                >
                  {row.title}
                </Link>
                <p className="text-xs text-muted">
                  {row.accepted_at
                    ? format(new Date(row.accepted_at), 'MMM d, HH:mm')
                    : 'Not accepted yet'}
                  {' · '}
                  {row.payment_status}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">
                {row.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function OverviewRecentReports({ rows }: { rows: OverviewRecentReport[] }) {
  return (
    <SectionCard title="Reports needing attention" href="/reports?status=open">
      {rows.length === 0 ? (
        <EmptyRow message="No open service problem reports." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="py-2.5 first:pt-0 last:pb-0">
              <Link
                href={`/reports?id=${row.id}`}
                className="font-medium text-ink hover:text-brand"
              >
                {row.kind.replaceAll('_', ' ')}
              </Link>
              <p className="text-xs text-muted">
                Request {row.request_id.slice(0, 8)}… ·{' '}
                {format(new Date(row.created_at), 'MMM d, HH:mm')}
                {row.respond_by
                  ? ` · respond by ${format(new Date(row.respond_by), 'MMM d, HH:mm')}`
                  : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function OverviewRecentFinancial({ rows }: { rows: OverviewRecentFinancial[] | null }) {
  if (rows === null) return null;

  return (
    <SectionCard title="Recent financial activity" href="/transactions">
      {rows.length === 0 ? (
        <EmptyRow message="No wallet transactions yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 pr-3 font-medium">Type</th>
                <th className="pb-2 pr-3 font-medium">Amount</th>
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/70 last:border-0">
                  <td className="py-2 pr-3 font-medium text-ink">
                    <Link href={`/transactions?id=${row.id}`} className="hover:text-brand">
                      {row.type.replaceAll('_', ' ')}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{formatNgnFromKobo(row.amount)}</td>
                  <td className="py-2 pr-3 text-muted">{row.status}</td>
                  <td className="py-2 text-muted">
                    {format(new Date(row.created_at), 'MMM d, HH:mm')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

export function OverviewQuickLinks({ data }: { data: OverviewPayload }) {
  const links = [
    { href: '/users', label: 'Users', show: true },
    { href: '/requests', label: 'Requests', show: true },
    { href: '/reports?status=open', label: 'Open reports', show: data.counts.open_reports > 0 },
    { href: '/transactions', label: 'Transactions', show: data.includes_financial },
    { href: '/wallets', label: 'Wallets', show: data.includes_financial },
    { href: '/withdrawals', label: 'Withdrawals', show: data.includes_financial },
    { href: '/settings', label: 'Access settings', show: data.includes_settings },
  ].filter((link) => link.show);

  return (
    <SectionCard title="Quick links">
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-ink hover:border-brand/40 hover:text-brand"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}

export function OverviewMetricDefinitions({ data }: { data: OverviewPayload }) {
  const keys = [
    'active_users_in_period',
    'gross_settled_volume_kobo',
    'commission_earned_kobo',
    'commission_collected_kobo',
    'user_deposits_in_period_kobo',
    'platform_wallet_available_kobo',
    'user_wallet_liabilities_kobo',
  ] as const;

  const entries = keys
    .map((key) => ({ key, text: data.definitions[key] }))
    .filter((entry) => entry.text);

  if (entries.length === 0 && data.unavailable_metrics.length === 0) return null;

  return (
    <SectionCard title="Metric definitions & gaps">
      {entries.length > 0 ? (
        <ul className="mb-4 space-y-2 text-sm text-muted">
          {entries.map((entry) => (
            <li key={entry.key}>
              <span className="font-medium text-ink">{entry.key}</span>: {entry.text}
            </li>
          ))}
        </ul>
      ) : null}
      {data.unavailable_metrics.length > 0 ? (
        <ul className="space-y-2 text-sm text-muted">
          {data.unavailable_metrics.map((item) => (
            <li key={item.key}>
              <span className="font-medium text-ink">{item.key}</span>: {item.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </SectionCard>
  );
}
