import { format } from 'date-fns';
import { Suspense } from 'react';

import { MetricCard } from '@/components/overview/metric-card';
import { OverviewDateRange } from '@/components/overview/overview-date-range';
import {
  OverviewMetricDefinitions,
  OverviewQuickLinks,
  OverviewRecentEngagements,
  OverviewRecentFinancial,
  OverviewRecentReports,
  OverviewRecentRequests,
  OverviewWarnings,
} from '@/components/overview/overview-sections';
import { TrendChart } from '@/components/overview/trend-chart';
import { formatCount, formatNgnFromKobo } from '@/lib/format/money';
import type { OverviewPayload } from '@/lib/overview/types';

type Props = {
  data: OverviewPayload;
};

export function OverviewDashboard({ data }: Props) {
  const periodLabel = `${format(new Date(data.period.start), 'MMM d, yyyy')} – ${format(
    new Date(data.period.end),
    'MMM d, yyyy',
  )}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm text-muted">Reporting window</p>
          <p className="text-base font-medium text-ink">{periodLabel}</p>
        </div>
        <Suspense fallback={<div className="h-10 w-48 animate-pulse rounded-lg bg-border" />}>
          <OverviewDateRange />
        </Suspense>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Registered users"
          value={formatCount(data.counts.total_users)}
          hint="All profiles"
          href="/users"
        />
        <MetricCard
          label="New users"
          value={formatCount(data.counts.new_users_in_period)}
          hint={data.definitions.active_users_in_period ? 'In selected period' : undefined}
          href="/users?sort=new"
        />
        <MetricCard
          label="Active users"
          value={formatCount(data.counts.active_users_in_period)}
          hint="Users with marketplace activity in period"
          href="/users?filter=active"
        />
        <MetricCard
          label="Open requests"
          value={formatCount(data.counts.open_requests)}
          href="/requests?status=open"
        />
        <MetricCard
          label="Active engagements"
          value={formatCount(data.counts.active_engagements)}
          href="/requests?status=active"
        />
        <MetricCard
          label="Completed engagements"
          value={formatCount(data.counts.completed_engagements_in_period)}
          hint="Completed in period"
          href="/requests?status=completed"
        />
        <MetricCard
          label="Open reports"
          value={formatCount(data.counts.open_reports)}
          href="/reports?status=open"
        />
        <MetricCard
          label="Pending withdrawals"
          value={formatCount(data.counts.pending_withdrawals)}
          hint="Withdrawals not launched in app; may stay at 0"
          href="/withdrawals?status=pending"
        />
      </div>

      {data.financial ? (
        <>
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Financial (NGN) · {periodLabel}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                label="Locked in active engagements"
                value={formatNgnFromKobo(data.financial.funds_locked_active_engagements_kobo)}
                hint="Active payment_locks on in-flight engagements (snapshot)"
                href="/wallets?filter=locked"
              />
              <MetricCard
                label="Gross settled volume"
                value={formatNgnFromKobo(data.financial.gross_settled_volume_kobo)}
                hint="Released payment_lock totals in period"
                href="/transactions?type=settled"
              />
              <MetricCard
                label="Commission earned"
                value={formatNgnFromKobo(data.financial.commission_earned_kobo)}
                hint="Service fees on locks released in period (10% policy)"
                href="/transactions?type=service_fee"
              />
              <MetricCard
                label="Commission collected"
                value={formatNgnFromKobo(data.financial.commission_collected_kobo)}
                hint="Completed service_fee ledger rows in period"
                href="/transactions?type=service_fee"
              />
              <MetricCard
                label="Commission pending"
                value={formatNgnFromKobo(data.financial.commission_pending_on_active_locks_kobo)}
                hint="On active locks — not collected until release"
                href="/wallets?filter=pending_commission"
              />
              <MetricCard
                label="Refunds (period)"
                value={formatNgnFromKobo(data.financial.refunds_in_period_kobo)}
                href="/transactions?type=refund"
              />
              <MetricCard
                label="Adjustments (period)"
                value={formatNgnFromKobo(data.financial.adjustments_in_period_kobo)}
                href="/transactions?type=adjustment"
              />
              <MetricCard
                label="User deposits (period)"
                value={formatNgnFromKobo(data.financial.user_deposits_in_period_kobo)}
                hint="Custodial funding — not revenue"
                href="/transactions?type=deposit"
              />
            </div>
          </div>

          {data.snapshots ? (
            <div className="grid gap-4 md:grid-cols-2">
              <MetricCard
                label="Platform book balance"
                value={formatNgnFromKobo(data.snapshots.platform_wallet_available_kobo)}
                hint="platform_wallet.available (snapshot)"
                href="/wallets?view=platform"
              />
              <MetricCard
                label="User wallet liabilities"
                value={formatNgnFromKobo(data.snapshots.user_wallet_liabilities_kobo)}
                hint="Sum of user available + locked — not platform cash"
                href="/wallets"
              />
            </div>
          ) : null}
        </>
      ) : (
        <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
          Financial metrics are hidden for your role. Support Admins see marketplace activity only.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-xl border border-border bg-elevated p-4 shadow-card">
          <h2 className="mb-4 text-sm font-semibold text-ink">Trends</h2>
          <TrendChart days={data.trends} showCommission={data.includes_financial} />
        </div>
        <OverviewWarnings warnings={data.warnings} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OverviewRecentRequests rows={data.recent.requests} />
        <OverviewRecentEngagements rows={data.recent.engagements} />
        <OverviewRecentReports rows={data.recent.reports} />
        <OverviewRecentFinancial rows={data.recent.financial_activity} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OverviewQuickLinks data={data} />
        <OverviewMetricDefinitions data={data} />
      </div>
    </div>
  );
}
