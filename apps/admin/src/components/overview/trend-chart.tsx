import type { OverviewTrendDay } from '@/lib/overview/types';
import { formatNgnFromKobo } from '@/lib/format/money';

type Series = {
  key: keyof Pick<OverviewTrendDay, 'new_users' | 'requests_posted' | 'engagements_completed'>;
  label: string;
  color: string;
};

const SERIES: Series[] = [
  { key: 'new_users', label: 'New users', color: 'bg-teal-500' },
  { key: 'requests_posted', label: 'Requests posted', color: 'bg-sky-500' },
  { key: 'engagements_completed', label: 'Completions', color: 'bg-indigo-500' },
];

type Props = {
  days: OverviewTrendDay[];
  showCommission: boolean;
};

export function TrendChart({ days, showCommission }: Props) {
  if (days.length === 0) {
    return <p className="text-sm text-muted">No trend data for this period.</p>;
  }

  const maxCount = Math.max(
    1,
    ...days.flatMap((d) => [d.new_users, d.requests_posted, d.engagements_completed]),
  );

  const maxCommission = Math.max(1, ...days.map((d) => d.commission_collected_kobo ?? 0));

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
          Activity (daily)
        </p>
        <div
          className="flex items-end gap-1 overflow-x-auto pb-2"
          role="img"
          aria-label="Daily activity chart"
        >
          {days.map((day) => (
            <div key={day.day} className="flex min-w-[28px] flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end justify-center gap-0.5">
                {SERIES.map((series) => {
                  const value = day[series.key];
                  const height = Math.max(4, Math.round((value / maxCount) * 96));
                  return (
                    <div
                      key={series.key}
                      className={`w-2 rounded-t ${series.color}`}
                      style={{ height }}
                      title={`${series.label}: ${value}`}
                    />
                  );
                })}
              </div>
              <span className="text-[10px] text-subtle">{day.day.slice(5)}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
          {SERIES.map((series) => (
            <span key={series.key} className="inline-flex items-center gap-1.5">
              <span className={`size-2 rounded-sm ${series.color}`} />
              {series.label}
            </span>
          ))}
        </div>
      </div>

      {showCommission ? (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Commission collected (daily)
          </p>
          <div
            className="flex items-end gap-1 overflow-x-auto pb-2"
            role="img"
            aria-label="Daily commission chart"
          >
            {days.map((day) => {
              const value = day.commission_collected_kobo ?? 0;
              const height = Math.max(4, Math.round((value / maxCommission) * 72));
              return (
                <div
                  key={`fee-${day.day}`}
                  className="flex min-w-[28px] flex-1 flex-col items-center gap-1"
                >
                  <div
                    className="w-full max-w-[20px] rounded-t bg-amber-500"
                    style={{ height }}
                    title={formatNgnFromKobo(value)}
                  />
                  <span className="text-[10px] text-subtle">{day.day.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
