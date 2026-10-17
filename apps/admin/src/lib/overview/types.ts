export type OverviewPeriod = {
  start: string;
  end: string;
};

export type OverviewCounts = {
  total_users: number;
  new_users_in_period: number;
  active_users_in_period: number;
  open_requests: number;
  active_engagements: number;
  completed_engagements_in_period: number;
  open_reports: number;
  pending_withdrawals: number;
};

export type OverviewFinancial = {
  funds_locked_active_engagements_kobo: number;
  gross_settled_volume_kobo: number;
  commission_earned_kobo: number;
  commission_collected_kobo: number;
  commission_pending_on_active_locks_kobo: number;
  refunds_in_period_kobo: number;
  adjustments_in_period_kobo: number;
  user_deposits_in_period_kobo: number;
};

export type OverviewSnapshots = {
  platform_wallet_available_kobo: number;
  user_wallet_liabilities_kobo: number;
};

export type OverviewTrendDay = {
  day: string;
  new_users: number;
  requests_posted: number;
  engagements_completed: number;
  commission_collected_kobo: number | null;
};

export type OverviewRecentRequest = {
  id: string;
  title: string;
  status: string;
  created_at: string;
};

export type OverviewRecentEngagement = {
  request_id: string;
  title: string;
  status: string;
  accepted_at: string | null;
  payment_status: string;
};

export type OverviewRecentReport = {
  id: string;
  request_id: string;
  kind: string;
  status: string;
  respond_by: string | null;
  created_at: string;
};

export type OverviewRecentFinancial = {
  id: string;
  type: string;
  status: string;
  amount: number;
  request_id: string | null;
  created_at: string;
};

export type OverviewWarning = {
  code: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  href: string;
};

export type OverviewUnavailableMetric = {
  key: string;
  reason: string;
};

export type OverviewPayload = {
  period: OverviewPeriod;
  definitions: Record<string, string>;
  unavailable_metrics: OverviewUnavailableMetric[];
  counts: OverviewCounts;
  financial: OverviewFinancial | null;
  snapshots: OverviewSnapshots | null;
  trends: OverviewTrendDay[];
  recent: {
    requests: OverviewRecentRequest[];
    engagements: OverviewRecentEngagement[];
    reports: OverviewRecentReport[];
    financial_activity: OverviewRecentFinancial[] | null;
  };
  warnings: OverviewWarning[];
  includes_financial: boolean;
  includes_settings: boolean;
};

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function parseOverviewPayload(raw: unknown): OverviewPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;

  const periodRaw = row.period;
  if (!periodRaw || typeof periodRaw !== 'object') return null;
  const periodObj = periodRaw as Record<string, unknown>;
  if (typeof periodObj.start !== 'string' || typeof periodObj.end !== 'string') return null;

  const countsRaw = row.counts;
  if (!countsRaw || typeof countsRaw !== 'object') return null;
  const countsObj = countsRaw as Record<string, unknown>;

  const counts: OverviewCounts = {
    total_users: asNumber(countsObj.total_users),
    new_users_in_period: asNumber(countsObj.new_users_in_period),
    active_users_in_period: asNumber(countsObj.active_users_in_period),
    open_requests: asNumber(countsObj.open_requests),
    active_engagements: asNumber(countsObj.active_engagements),
    completed_engagements_in_period: asNumber(countsObj.completed_engagements_in_period),
    open_reports: asNumber(countsObj.open_reports),
    pending_withdrawals: asNumber(countsObj.pending_withdrawals),
  };

  const parseFinancial = (value: unknown): OverviewFinancial | null => {
    if (!value || typeof value !== 'object') return null;
    const f = value as Record<string, unknown>;
    return {
      funds_locked_active_engagements_kobo: asNumber(f.funds_locked_active_engagements_kobo),
      gross_settled_volume_kobo: asNumber(f.gross_settled_volume_kobo),
      commission_earned_kobo: asNumber(f.commission_earned_kobo),
      commission_collected_kobo: asNumber(f.commission_collected_kobo),
      commission_pending_on_active_locks_kobo: asNumber(
        f.commission_pending_on_active_locks_kobo,
      ),
      refunds_in_period_kobo: asNumber(f.refunds_in_period_kobo),
      adjustments_in_period_kobo: asNumber(f.adjustments_in_period_kobo),
      user_deposits_in_period_kobo: asNumber(f.user_deposits_in_period_kobo),
    };
  };

  const parseSnapshots = (value: unknown): OverviewSnapshots | null => {
    if (!value || typeof value !== 'object') return null;
    const s = value as Record<string, unknown>;
    return {
      platform_wallet_available_kobo: asNumber(s.platform_wallet_available_kobo),
      user_wallet_liabilities_kobo: asNumber(s.user_wallet_liabilities_kobo),
    };
  };

  const trends: OverviewTrendDay[] = Array.isArray(row.trends)
    ? row.trends
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((t) => ({
          day: String(t.day),
          new_users: asNumber(t.new_users),
          requests_posted: asNumber(t.requests_posted),
          engagements_completed: asNumber(t.engagements_completed),
          commission_collected_kobo:
            t.commission_collected_kobo === null
              ? null
              : asNumber(t.commission_collected_kobo),
        }))
    : [];

  const recentRaw = row.recent;
  if (!recentRaw || typeof recentRaw !== 'object') return null;
  const recentObj = recentRaw as Record<string, unknown>;

  const definitions: Record<string, string> = {};
  if (row.definitions && typeof row.definitions === 'object') {
    for (const [key, value] of Object.entries(row.definitions as Record<string, unknown>)) {
      if (typeof value === 'string') definitions[key] = value;
    }
  }

  const unavailable_metrics: OverviewUnavailableMetric[] = Array.isArray(row.unavailable_metrics)
    ? row.unavailable_metrics
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          key: String(item.key),
          reason: String(item.reason),
        }))
    : [];

  const warnings: OverviewWarning[] = Array.isArray(row.warnings)
    ? row.warnings
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          code: String(item.code),
          severity: (item.severity === 'high' || item.severity === 'medium' || item.severity === 'low'
            ? item.severity
            : 'low') as OverviewWarning['severity'],
          message: String(item.message),
          href: String(item.href),
        }))
    : [];

  return {
    period: { start: periodObj.start, end: periodObj.end },
    definitions,
    unavailable_metrics,
    counts,
    financial: parseFinancial(row.financial),
    snapshots: parseSnapshots(row.snapshots),
    trends,
    recent: {
      requests: Array.isArray(recentObj.requests) ? (recentObj.requests as OverviewRecentRequest[]) : [],
      engagements: Array.isArray(recentObj.engagements)
        ? (recentObj.engagements as OverviewRecentEngagement[])
        : [],
      reports: Array.isArray(recentObj.reports) ? (recentObj.reports as OverviewRecentReport[]) : [],
      financial_activity: Array.isArray(recentObj.financial_activity)
        ? (recentObj.financial_activity as OverviewRecentFinancial[])
        : null,
    },
    warnings,
    includes_financial: row.includes_financial === true,
    includes_settings: row.includes_settings === true,
  };
}
