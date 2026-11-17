'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { MilestoneApproveSheet } from '@/components/request-flow/MilestoneApproveSheet';
import { MilestoneSubmitSheet } from '@/components/request-flow/MilestoneSubmitSheet';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { Button } from '@/components/ui/Button';
import { InlineError } from '@/components/ui/StateView';
import {
  type EngagementMilestoneRow,
  useApproveEngagementMilestone,
  useSubmitEngagementMilestone,
} from '@/features/requests/milestone-api';
import {
  engagementMilestoneDotVariant,
  type MilestoneDotVariant,
} from '@/features/requests/milestone-dot-variant';
import { postMilestoneSubmissionToChat } from '@/features/requests/post-milestone-submission-chat';
import type { CompletionProofStagedMedia } from '@/features/requests/send-completion-proof-message';
import { invalidateConversationInboxQueries } from '@/features/requests/conversation-api';
import type { Database } from '@/lib/supabase/database.types';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { showAppToast } from '@/lib/toast';

type MilestoneStatus = Database['public']['Enums']['milestone_status'];

function statusBadgeLabel(status: MilestoneStatus): string | null {
  switch (status) {
    case 'submitted':
      return 'Awaiting approval';
    case 'approved_paid':
      return 'Released';
    case 'in_progress':
      return 'In progress';
    default:
      return null;
  }
}

function statusBadgeClass(status: MilestoneStatus): string {
  switch (status) {
    case 'submitted':
      return 'text-warning border-warning/35 bg-warning/10';
    case 'approved_paid':
      return 'text-active border-active/35 bg-active/10';
    case 'in_progress':
      return 'text-muted border-hairline bg-surface';
    default:
      return 'text-muted border-hairline bg-surface';
  }
}

function engagementDotClass(variant: MilestoneDotVariant, stepApproved: boolean): string {
  const base =
    'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-xs font-extrabold shadow-[0_0_0_2px_var(--color-canvas)]';
  switch (variant) {
    case 'approved':
      return cn(base, 'border-2 border-active bg-active text-on-brand');
    case 'active':
      return cn(base, 'border-2 border-warning bg-warning text-ink');
    case 'pending':
      return cn(base, 'border-2 border-warning bg-warning-soft text-warning');
    default:
      return cn(base, 'border-2 border-hairline bg-surface text-muted');
  }
}

function railLineClass(stepApproved: boolean): string {
  return cn(
    'mt-1.5 min-h-4 w-0.5 flex-1',
    stepApproved ? 'bg-active/60' : 'bg-hairline',
  );
}

export function EngagementMilestoneProgress({
  requestId,
  conversationId,
  milestones,
  currency,
  viewerIsRequester,
  paymentDisputed,
  onOpenChat,
}: {
  requestId: string;
  conversationId: string | null;
  milestones: EngagementMilestoneRow[];
  currency: string;
  viewerIsRequester: boolean;
  paymentDisputed: boolean;
  onOpenChat?: () => void;
}) {
  const queryClient = useQueryClient();
  const submitMilestone = useSubmitEngagementMilestone(requestId);
  const approveMilestone = useApproveEngagementMilestone(requestId);
  const [submitTarget, setSubmitTarget] = useState<EngagementMilestoneRow | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [approveTarget, setApproveTarget] = useState<EngagementMilestoneRow | null>(null);

  const sorted = useMemo(
    () => [...milestones].sort((a, b) => a.milestone_position - b.milestone_position),
    [milestones],
  );

  const runMilestoneSubmit = async (input: {
    message: string;
    staged: CompletionProofStagedMedia | null;
  }) => {
    if (!submitTarget) return;
    setSubmitBusy(true);
    try {
      if (conversationId && (input.message.trim() || input.staged)) {
        try {
          await postMilestoneSubmissionToChat({
            conversationId,
            position: submitTarget.milestone_position,
            message: input.message,
            staged: input.staged,
          });
          void queryClient.invalidateQueries({ queryKey: queryKeys.requestConversation(requestId) });
          invalidateConversationInboxQueries(queryClient);
          if (conversationId) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.requestMessages(conversationId),
            });
          }
        } catch (error) {
          const note =
            error instanceof Error ? error.message : 'Could not post to chat.';
          showAppToast(`Submitted milestone, but chat failed: ${note}`, 'warning');
        }
      }

      await submitMilestone.mutateAsync(submitTarget.milestone_id);
      showAppToast('Milestone submitted for approval', 'success');
      setSubmitTarget(null);
    } catch (error) {
      const note =
        error instanceof Error ? error.message : 'Could not submit milestone.';
      showAppToast(note, 'warning');
    } finally {
      setSubmitBusy(false);
    }
  };

  const closeApproveSheet = () => {
    if (approveMilestone.isPending) return;
    approveMilestone.reset();
    setApproveTarget(null);
  };

  const runMilestoneApprove = () => {
    if (!approveTarget) return;
    approveMilestone.mutate(approveTarget.milestone_id, {
      onSuccess: () => {
        showAppToast('Milestone approved — payment released', 'success');
        setApproveTarget(null);
      },
    });
  };

  if (sorted.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-row items-center justify-between gap-2">
        <h4 className="m-0 text-[13px] font-bold tracking-wide text-ink">Milestone progress</h4>
        <span className="rounded-full border border-hairline bg-surface px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">
          {sorted.length} steps
        </span>
      </header>
      <p className="text-sm leading-5 text-muted">
        Work through milestones in order. Each payment releases after requester approval.
      </p>

      {paymentDisputed ? (
        <RequestCallout tone="danger" title="Payments paused">
          <p className="text-sm text-muted">
            Milestone payouts are on hold while this issue is being reviewed.
          </p>
        </RequestCallout>
      ) : null}

      <ol className="m-0 flex list-none flex-col p-0" aria-label="Milestone schedule">
        {sorted.map((row, index) => {
          const isLast = index === sorted.length - 1;
          const dotVariant = engagementMilestoneDotVariant(row.status);
          const badgeLabel = statusBadgeLabel(row.status);
          const helperCanSubmit =
            !viewerIsRequester && !paymentDisputed && row.status === 'in_progress';
          const requesterCanReview =
            viewerIsRequester && !paymentDisputed && row.status === 'submitted';

          return (
            <li
              key={row.milestone_id}
              className={cn(
                'grid w-full min-w-0 grid-cols-[30px_minmax(0,1fr)] gap-3',
                isLast ? 'pb-1' : 'pb-3.5',
              )}
            >
              <span className="relative flex min-h-full shrink-0 flex-col items-center" aria-hidden>
                <span className={engagementDotClass(dotVariant, row.status === 'approved_paid')}>
                  {row.milestone_position}
                </span>
                {!isLast ? (
                  <span className={railLineClass(row.status === 'approved_paid')} />
                ) : null}
              </span>
              <article className="min-w-0 w-full max-w-full overflow-hidden">
                <div className="flex min-w-0 flex-row items-start justify-between gap-2">
                  <h5 className="m-0 min-w-0 flex-1 text-base font-semibold text-ink">{row.title}</h5>
                  <span className="shrink-0 text-base font-bold text-ink">
                    {formatMoney(row.amount_major, currency)}
                  </span>
                </div>
                {row.description ? (
                  <p className="mt-1 text-sm leading-5 text-muted">{row.description}</p>
                ) : null}

                {badgeLabel ? (
                  <p
                    className={cn(
                      'mt-2 inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-bold',
                      statusBadgeClass(row.status),
                    )}
                  >
                    {badgeLabel}
                  </p>
                ) : null}

                {row.submitted_at ? (
                  <p className="mt-1 text-xs text-muted">
                    Submitted {new Date(row.submitted_at).toLocaleString()}
                  </p>
                ) : null}
                {row.approved_at ? (
                  <p className="mt-1 text-xs text-muted">
                    Approved and paid {new Date(row.approved_at).toLocaleString()}
                  </p>
                ) : null}

                {helperCanSubmit || requesterCanReview ? (
                  <div className="mt-3 flex flex-col gap-2">
                    {helperCanSubmit ? (
                      <Button
                        label="Submit for approval"
                        size="lg"
                        variant="active"
                        onClick={() => setSubmitTarget(row)}
                      />
                    ) : null}
                    {requesterCanReview ? (
                      <Button
                        label="Approve and pay"
                        size="lg"
                        variant="active"
                        onClick={() => setApproveTarget(row)}
                      />
                    ) : null}
                  </div>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>

      {submitMilestone.isError ? <InlineError error={submitMilestone.error} /> : null}

      <MilestoneApproveSheet
        open={approveTarget != null}
        busy={approveMilestone.isPending}
        error={approveTarget != null && approveMilestone.isError ? approveMilestone.error : null}
        milestoneTitle={approveTarget?.title ?? ''}
        milestonePosition={approveTarget?.milestone_position ?? 0}
        milestoneAmountMajor={approveTarget?.amount_major ?? 0}
        currency={currency}
        onClose={closeApproveSheet}
        onApprove={runMilestoneApprove}
        onOpenChat={conversationId && onOpenChat ? onOpenChat : undefined}
      />

      <MilestoneSubmitSheet
        open={submitTarget != null}
        busy={submitBusy || submitMilestone.isPending}
        milestoneTitle={submitTarget?.title ?? ''}
        milestonePosition={submitTarget?.milestone_position ?? 0}
        onClose={() => {
          if (submitBusy) return;
          setSubmitTarget(null);
        }}
        onSubmit={(payload) => void runMilestoneSubmit(payload)}
      />
    </div>
  );
}