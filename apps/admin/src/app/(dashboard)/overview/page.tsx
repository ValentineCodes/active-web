import { OverviewDashboard } from '@/components/overview/overview-dashboard';
import { fetchOverview } from '@/lib/overview/fetch';
import { resolveOverviewPeriod } from '@/lib/overview/period';
import { requireAdminSessionForPath } from '@/lib/admin/session';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OverviewPage({ searchParams }: Props) {
  await requireAdminSessionForPath('/overview');
  const params = await searchParams;
  const period = resolveOverviewPeriod(params);
  const result = await fetchOverview(period.start, period.end);

  if (!result.ok) {
    throw new Error(result.error);
  }

  return <OverviewDashboard data={result.data} />;
}
