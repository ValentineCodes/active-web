import { formatNgnFromKobo } from '@/lib/format/money';

type Financial = {
  funds_locked_active_engagements_kobo?: number;
  gross_settled_volume_kobo?: number;
  commission_earned_kobo?: number;
  commission_collected_kobo?: number;
  commission_pending_on_active_locks_kobo?: number;
  refunds_in_period_kobo?: number;
  adjustments_in_period_kobo?: number;
  user_deposits_in_period_kobo?: number;
};

type Snapshots = {
  platform_wallet_available_kobo?: number;
  user_wallet_liabilities_kobo?: number;
};

type Props = {
  financial: Financial | null;
  snapshots: Snapshots | null;
  unavailable: Array<{ key: string; reason: string }>;
};

export function FinanceSummaryPanel({ financial, snapshots, unavailable }: Props) {
  if (!financial) {
    return (
      <p className="text-sm text-muted">
        Commission and revenue metrics require the transactions permission.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Gross settled volume" value={financial.gross_settled_volume_kobo} />
        <Metric label="Commission earned (on release)" value={financial.commission_earned_kobo} />
        <Metric label="Commission collected" value={financial.commission_collected_kobo} />
        <Metric
          label="Outstanding on active locks"
          value={financial.commission_pending_on_active_locks_kobo}
        />
        <Metric label="Refunds (period)" value={financial.refunds_in_period_kobo} />
        <Metric label="Adjustments (period)" value={financial.adjustments_in_period_kobo} />
        <Metric
          label="User deposits (period)"
          hint="Custodial funding, not revenue"
          value={financial.user_deposits_in_period_kobo}
        />
        <Metric
          label="Funds locked (active engagements)"
          value={financial.funds_locked_active_engagements_kobo}
        />
      </div>
      {snapshots ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Platform wallet (book)</dt>
            <dd className="font-medium text-ink">
              {formatNgnFromKobo(snapshots.platform_wallet_available_kobo)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">User wallet liabilities</dt>
            <dd className="font-medium text-ink">
              {formatNgnFromKobo(snapshots.user_wallet_liabilities_kobo)}
            </dd>
          </div>
        </dl>
      ) : null}
      {unavailable.length > 0 ? (
        <ul className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
          {unavailable.map((item) => (
            <li key={item.key}>
              <span className="font-medium text-ink">{item.key.replaceAll('_', ' ')}</span>:{' '}
              {item.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value?: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-elevated p-3 shadow-card">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink">{formatNgnFromKobo(value)}</p>
      {hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}
