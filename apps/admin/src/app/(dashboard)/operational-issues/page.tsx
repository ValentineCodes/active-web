import Link from 'next/link';
import { format } from 'date-fns';

import { IssueRecoveryActions } from '@/components/operations/issue-recovery-actions';
import { fetchOperationalIssues } from '@/lib/admin/operations';
import { requireAdminSessionForPath } from '@/lib/admin/session';

export const dynamic = 'force-dynamic';

const SEVERITY_TONE: Record<string, string> = {
  high: 'border-red-200 bg-red-50 text-red-900',
  medium: 'border-amber-200 bg-amber-50 text-amber-950',
  low: 'border-border bg-surface text-ink',
};

export default async function OperationalIssuesPage() {
  await requireAdminSessionForPath('/operational-issues');

  let data: Awaited<ReturnType<typeof fetchOperationalIssues>> | null = null;
  let error: string | null = null;
  try {
    data = await fetchOperationalIssues();
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : 'Could not load operational issues';
  }

  const items = data?.items ?? [];
  const gaps = data?.gaps ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Operational issues</h2>
        <p className="mt-1 text-sm text-muted">
          Prioritized diagnostics from ledger, Paystack deposits, engagements, and reconciliation rules. Recovery
          actions call existing backend RPCs with validation, idempotency, and audit — never raw SQL edits.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        {items.length === 0 ? (
          <p className="rounded-xl border border-border bg-elevated px-4 py-8 text-center text-sm text-muted">
            No issues detected by current checks.
          </p>
        ) : (
          items.map((issue) => {
            const tone = SEVERITY_TONE[issue.severity] ?? SEVERITY_TONE.low;
            const actions = (issue.available_actions ?? []) as Array<{
              action: string;
              label: string;
              requires_reason?: boolean;
              requires_confirmation?: boolean;
            }>;
            return (
              <article
                key={issue.id}
                className={`rounded-xl border p-4 shadow-card ${tone}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                      {issue.severity} · {issue.code.replaceAll('_', ' ')}
                    </p>
                    <p className="mt-1 font-medium">{issue.message}</p>
                    <p className="mt-1 text-xs opacity-80">
                      Status: {issue.resolution_status}
                      {issue.detected_at
                        ? ` · Detected ${format(new Date(issue.detected_at), 'PPpp')}`
                        : ''}
                      {issue.last_attempt_at
                        ? ` · Last signal ${format(new Date(issue.last_attempt_at), 'PPpp')}`
                        : ''}
                      {issue.count && issue.count > 1 ? ` · ${issue.count} affected` : ''}
                    </p>
                  </div>
                  {issue.href ? (
                    <Link href={issue.href} className="text-sm font-medium underline shrink-0">
                      Investigate →
                    </Link>
                  ) : null}
                </div>
                {issue.request_id && actions.length > 0 ? (
                  <IssueRecoveryActions requestId={issue.request_id} actions={actions} />
                ) : null}
              </article>
            );
          })
        )}
      </section>

      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Detection gaps</h3>
        <p className="mt-1 text-xs text-muted">
          These areas need durable backend telemetry before the dashboard can surface them reliably.
        </p>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          {gaps.map((gap) => (
            <li key={gap.key}>
              <span className="font-medium text-ink">{gap.key.replaceAll('_', ' ')}</span>: {gap.reason}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
