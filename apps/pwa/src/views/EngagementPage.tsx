'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { InlineError, LoadingState } from '@/components/ui/StateView';
import { useRequestConversation } from '@/features/requests/conversation-api';
import { useCompleteRequest, useEngagement, useReportServiceProblem } from '@/features/requests/requester-api';
import { useMarkServiceComplete } from '@/features/requests/responses-api';
import { REQUEST_REPORT_ISSUES } from '@/features/support/report-issue-options';
import { formatMoney, formatWhenHome } from '@/lib/format';
import { useRouteParam } from '@/lib/route-param';
import { showAppToast } from '@/lib/toast';

export function EngagementPage() {
  const router = useRouter();
  const id = useRouteParam('id');
  const engagement = useEngagement(id);
  const conversation = useRequestConversation(id);
  const completeRequest = useCompleteRequest(id);
  const responderComplete = useMarkServiceComplete(id);
  const reportProblem = useReportServiceProblem(id);
  const [reportKind, setReportKind] = useState<string | null>(null);

  if (engagement.isLoading) {
    return (
      <FlowScreen title="Engagement" backTo="/activity">
        <LoadingState />
      </FlowScreen>
    );
  }
  if (engagement.isError || !engagement.data) {
    return (
      <FlowScreen title="Engagement" backTo="/activity">
        <InlineError message={engagement.error instanceof Error ? engagement.error.message : 'Engagement not available.'} />
      </FlowScreen>
    );
  }

  const row = engagement.data;
  const amount = row.agreed_provider_amount ?? row.quoted_amount ?? row.offered_amount;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <RequestFlowHeader title="Engagement" onBack={() => router.push('/activity')} />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-8 pt-2">
        <Card tone="surface" className="!p-4">
          <h2 className="text-lg font-bold text-ink">{row.title}</h2>
          <p className="text-sm text-subtle">Status: {row.request_status}</p>
          <p className="text-sm text-subtle">{formatWhenHome(row.scheduled_for)}</p>
          {amount != null ? <p className="text-lg font-bold text-active">{formatMoney(amount, row.currency)}</p> : null}
          {row.counterparty_display_name ? <p className="text-sm text-ink">With {row.counterparty_display_name}</p> : null}
          {row.counterparty_phone ? <p className="text-sm text-muted">Phone: {row.counterparty_phone}</p> : null}
          {row.request_latitude != null && row.request_longitude != null ? (
            <a
              className="text-sm font-semibold text-brand"
              href={`https://www.google.com/maps/search/?api=1&query=${row.request_latitude},${row.request_longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              Open exact location
            </a>
          ) : null}
        </Card>

        {conversation.data?.conversationId ? (
          <Button label="Open chat" onClick={() => router.push(`/conversation/${conversation.data!.conversationId}`)} />
        ) : null}

        {row.viewer_is_requester && row.request_status === 'completion_pending' ? (
          <Button
            label="Confirm completion"
            loading={completeRequest.isPending}
            onClick={() => void completeRequest.mutateAsync().then(() => showAppToast('Completion confirmed.'))}
          />
        ) : null}

        {!row.viewer_is_requester && (row.request_status === 'accepted' || row.request_status === 'in_progress') ? (
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
          <Card tone="surface" className="!p-4">
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
          </Card>
        ) : null}

        {row.request_status === 'completed' && !row.viewer_has_rated ? (
          <Button label="Rate this experience" variant="ghost" onClick={() => router.push(`/rate/${id}`)} />
        ) : null}
      </div>
    </div>
  );
}
