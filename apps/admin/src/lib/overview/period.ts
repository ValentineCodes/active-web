import { endOfDay, startOfDay, subDays } from 'date-fns';

export type OverviewRangePreset = '7d' | '30d' | '90d';

export type ResolvedOverviewPeriod = {
  start: Date;
  end: Date;
  preset: OverviewRangePreset | 'custom';
  label: string;
};

export function resolveOverviewPeriod(
  searchParams: Record<string, string | string[] | undefined>,
): ResolvedOverviewPeriod {
  const now = new Date();
  const rangeParam = typeof searchParams.range === 'string' ? searchParams.range : '30d';
  const fromParam = typeof searchParams.from === 'string' ? searchParams.from : undefined;
  const toParam = typeof searchParams.to === 'string' ? searchParams.to : undefined;

  if (fromParam && toParam) {
    const start = startOfDay(new Date(fromParam));
    const end = endOfDay(new Date(toParam));
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start) {
      return {
        start,
        end,
        preset: 'custom',
        label: `${fromParam} – ${toParam}`,
      };
    }
  }

  const days =
    rangeParam === '7d' ? 7 : rangeParam === '90d' ? 90 : 30;
  const preset: OverviewRangePreset =
    rangeParam === '7d' ? '7d' : rangeParam === '90d' ? '90d' : '30d';

  const end = endOfDay(now);
  const start = startOfDay(subDays(now, days - 1));

  return {
    start,
    end,
    preset,
    label: `Last ${days} days`,
  };
}

export function periodSearchParams(period: ResolvedOverviewPeriod): URLSearchParams {
  const params = new URLSearchParams();
  if (period.preset === 'custom') {
    params.set('from', period.start.toISOString().slice(0, 10));
    params.set('to', period.end.toISOString().slice(0, 10));
  } else {
    params.set('range', period.preset);
  }
  return params;
}
