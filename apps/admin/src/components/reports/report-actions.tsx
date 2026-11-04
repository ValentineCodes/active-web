'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

type AssignableAdmin = { user_id: string; email: string | null };

type Props = {
  reportId: string;
  isOpen: boolean;
  assignedAdminId: string | null;
  assignableAdmins: AssignableAdmin[];
  canRestrictUsers: boolean;
  counterpartyUserId: string | null;
};

export function ReportActions({
  reportId,
  isOpen,
  assignedAdminId,
  assignableAdmins,
  canRestrictUsers,
  counterpartyUserId,
}: Props) {
  const router = useRouter();
  const [assignee, setAssignee] = useState(assignedAdminId ?? '');
  const [note, setNote] = useState('');
  const [findings, setFindings] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [outcome, setOutcome] = useState<'refund_requester' | 'pay_provider' | 'resume_service'>(
    'resume_service',
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const post = async (path: string, body: Record<string, unknown>) => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? 'Action failed');
      }
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <p className="text-sm text-muted">
        This report is closed. Resolution history is shown below; new investigation actions are not
        available.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-ink">Assignment</h3>
        <p className="mt-1 text-xs text-muted">
          Assign an administrator for triage. This does not notify users or change the engagement.
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <select
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          >
            <option value="">Unassigned</option>
            {assignableAdmins.map((admin) => (
              <option key={admin.user_id} value={admin.user_id}>
                {admin.email ?? admin.user_id}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            loading={loading}
            onClick={() =>
              post(`/api/admin/reports/${reportId}/assign`, {
                adminId: assignee || null,
              })
            }
          >
            Save assignment
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ink">Investigation status</h3>
        <p className="mt-1 text-xs text-muted">
          Queue status is for internal coordination only. User-facing report state remains{' '}
          <span className="font-medium">open</span> until resolved via the actions below or the
          mobile contest flow.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            loading={loading}
            onClick={() =>
              post(`/api/admin/reports/${reportId}/investigation`, { queueStatus: 'under_review' })
            }
          >
            Under review
          </Button>
          <Button
            variant="secondary"
            loading={loading}
            onClick={() =>
              post(`/api/admin/reports/${reportId}/investigation`, { queueStatus: 'awaiting_info' })
            }
          >
            Awaiting information
          </Button>
          <Button
            variant="secondary"
            loading={loading}
            onClick={() =>
              post(`/api/admin/reports/${reportId}/investigation`, {
                queueStatus: 'escalated',
                reason: escalationReason,
              })
            }
          >
            Escalate
          </Button>
        </div>
        <textarea
          value={escalationReason}
          onChange={(event) => setEscalationReason(event.target.value)}
          placeholder="Escalation reason (required, min 10 characters)"
          className="mt-2 min-h-16 w-full rounded-lg border border-border px-3 py-2 text-sm"
        />
        <p className="mt-2 text-xs text-muted">
          To request more detail from users, use the existing request chat (participants only).
          There is no separate admin messaging channel in this release.
        </p>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-ink">Internal note</h3>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="mt-2 min-h-20 w-full rounded-lg border border-border px-3 py-2 text-sm"
          placeholder="Private note for other administrators"
        />
        <Button
          className="mt-2"
          variant="secondary"
          loading={loading}
          onClick={() =>
            post(`/api/admin/reports/${reportId}/notes`, { body: note }).then(() => setNote(''))
          }
        >
          Save note
        </Button>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-ink">Record resolution</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          These outcomes call the existing{' '}
          <code className="text-xs">admin_resolve_service_problem</code> backend. They are explicit
          financial or engagement decisions — not automatic consequences of opening a report.
        </p>
        <select
          value={outcome}
          onChange={(event) => setOutcome(event.target.value as typeof outcome)}
          className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm"
        >
          <option value="resume_service">Resume service (restore pre-report status)</option>
          <option value="refund_requester">Refund requester (authorized dispute resolution)</option>
          <option value="pay_provider">Pay provider (authorized dispute resolution)</option>
        </select>
        <textarea
          value={findings}
          onChange={(event) => setFindings(event.target.value)}
          placeholder="Findings and resolution note (minimum 10 characters)"
          className="mt-2 min-h-24 w-full rounded-lg border border-border px-3 py-2 text-sm"
        />
        <Button
          className="mt-2"
          variant="danger"
          loading={loading}
          onClick={() =>
            post(`/api/admin/reports/${reportId}/resolve`, {
              outcome,
              adminNote: findings,
              idempotencyKey: crypto.randomUUID(),
            })
          }
        >
          Apply resolution
        </Button>
      </div>

      {canRestrictUsers && counterpartyUserId ? (
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-ink">Account restriction</h3>
          <p className="mt-1 text-xs text-muted">
            Restrict new marketplace listings only. Does not cancel this engagement or move funds.
          </p>
          <Link
            href={`/users/${counterpartyUserId}`}
            className="mt-2 inline-block text-sm text-brand hover:text-brand-dark"
          >
            Open user profile to suspend or reinstate →
          </Link>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
