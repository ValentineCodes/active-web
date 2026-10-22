import { MetricCard } from '@/components/overview/metric-card';
import { formatNgnFromKobo } from '@/lib/format/money';
import type { WithdrawalsOverview } from '@/lib/admin/withdrawals-shared';

type Props = { overview: WithdrawalsOverview };

export function WithdrawalsOverviewCards({ overview }: Props) {
  const { metrics, definitions } = overview;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Pending review"
        value={String(metrics.pending_count)}
        hint={definitions.pending_count}
        href="/withdrawals?filter=pending"
      />
      <MetricCard
        label="Processing"
        value={String(metrics.processing_count)}
        hint={definitions.processing_count}
        href="/withdrawals?filter=processing"
      />
      <MetricCard
        label="Completed today"
        value={String(metrics.completed_today_count)}
        hint={definitions.completed_today_count}
        href="/withdrawals?filter=completed"
      />
      <MetricCard
        label="Outstanding value"
        value={formatNgnFromKobo(metrics.outstanding_total_kobo)}
        hint={definitions.outstanding_total_kobo}
        href="/withdrawals?filter=pending"
      />
    </div>
  );
}
