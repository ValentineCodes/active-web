import { Link, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { InlineError } from '@/components/ui/StateView';
import { useCompleteRequest, useEngagement, useReportServiceProblem } from '@/features/requests/requester-api';
import { useMarkServiceComplete } from '@/features/requests/responses-api';
import { useRequestConversation } from '@/features/requests/conversation-api';
import { REQUEST_REPORT_ISSUES } from '@/features/support/report-issue-options';
import { formatMoney, formatWhenHome } from '@/lib/format';
import { showAppToast } from '@/lib/toast';
import { useState } from 'react';

export function EngagementPage() {
  const { id = '' } = useParams();
  const engagement = useEngagement(id);
  const conversation = useRequestConversation(id);
  const completeRequest = useCompleteRequest(id);
  const responderComplete = useMarkServiceComplete(id);
  const reportProblem = useReportServiceProblem(id);
  const [reportKind, setReportKind] = useState<string | null>(null);

  if (engagement.isLoading) return <p className="text-sm text-subtle">Loading…</p>;
  if (engagement.isError || !engagement.data) {
    return (
      <InlineError
        message={engagement.error instanceof Error ? engagement.error.message : 'Engagement not available.'}
      />
    );
  }

  const row = engagement.data;
  const amount =
    row.agreed_provider_amount ?? row.quoted_amount ?? row.offered_amount;

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      <header className="flex items-center gap-2">
        <Link to="/activity" className="text-sm font-semibold text-brand">
          Back
        </Link>
        <h1 className="text-lg font-semibold text-ink">Engagement</h1>
      </header>

      <section className="rounded-2xl border border-hairline bg-elevated p-4">
        <h2 className="text-lg font-semibold text-ink">{row.title}</h2>
        <p className="mt-2 text-sm text-subtle">Status: {row.request_status}</p>
        <p className="mt-1 text-sm text-subtle">{formatWhenHome(row.scheduled_for)}</p>
        {amount != null ? (
          <p className="mt-2 font-semibold text-brand">{formatMoney(amount, row.currency)}</p>
        ) : null}
        {row.counterparty_display_name ? (
          <p className="mt-3 text-sm text-ink">With {row.counterparty_display_name}</p>
        ) : null}
        {row.counterparty_phone ? (
          <p className="mt-1 text-sm text-muted">Phone: {row.counterparty_phone}</p>
        ) : null}
        {row.request_latitude != null && row.request_longitude != null ? (
          <a
            className="mt-2 inline-block text-sm font-semibold text-brand"
            href={`https://www.google.com/maps/search/?api=1&query=${row.request_latitude},${row.request_longitude}`}
            target="_blank"
            rel="noreferrer"
          >
            Open exact location
          </a>
        ) : null}
      </section>

      {conversation.data?.conversationId ? (
        <Link
          to={`/conversation/${conversation.data.conversationId}`}
          className="rounded-xl bg-brand px-4 py-3 text-center text-sm font-semibold text-on-brand"
        >
          Open chat
        </Link>
      ) : null}

      {row.viewer_is_requester && row.request_status === 'completion_pending' ? (
        <Button
          label="Confirm completion"
          loading={completeRequest.isPending}
          onClick={() => void completeRequest.mutateAsync().then(() => showAppToast('Completion confirmed.'))}
        />
      ) : null}

      {!row.viewer_is_requester &&
      (row.request_status === 'accepted' || row.request_status === 'in_progress') ? (
        <Button
          label="Mark work complete"
          loading={responderComplete.isPending}
          onClick={() => void responderComplete.mutateAsync().then(() => showAppToast('Marked complete.'))}
        />
      ) : null}

      {row.viewer_is_requester && row.request_status === 'in_progress' ? (
        <Button
          label="Report a problem"
          variant="secondary"
          onClick={() => setReportKind(REQUEST_REPORT_ISSUES[0]?.id ?? null)}
        />
      ) : null}

      {reportKind ? (
        <section className="rounded-2xl bg-surface p-4">
          <p className="text-sm text-muted">Report: {reportKind}</p>
          <Button
            label="Submit report"
            className="mt-3"
            loading={reportProblem.isPending}
            onClick={() =>
              void reportProblem
                .mutateAsync({ kind: reportKind as never, description: '' })
                .then(() => {
                  showAppToast('Report submitted.');
                  setReportKind(null);
                })
            }
          />
        </section>
      ) : null}

      {row.request_status === 'completed' && !row.viewer_has_rated ? (
        <Link to={`/rate/${id}`} className="text-sm font-semibold text-brand">
          Rate this experience
        </Link>
      ) : null}
    </div>
  );
}
