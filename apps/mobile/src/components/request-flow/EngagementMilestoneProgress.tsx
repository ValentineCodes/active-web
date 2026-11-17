import { useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { RequestCallout } from '@/components/request-flow/RequestCallout';
import {
  MilestoneApproveSheet,
  type MilestoneApproveSheetHandle,
} from '@/components/request-flow/MilestoneApproveSheet';
import {
  MilestoneSubmitSheet,
  type MilestoneSubmitSheetHandle,
} from '@/components/request-flow/MilestoneSubmitSheet';
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
import { formatMoney } from '@/lib/format';
import { showAppToast } from '@/lib/toast';
import { cn } from '@/lib/cn';

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
      return 'border-warning/35 bg-warning/10 text-warning';
    case 'approved_paid':
      return 'border-active/35 bg-active/10 text-active';
    case 'in_progress':
      return 'border-hairline bg-surface text-muted';
    default:
      return 'border-hairline bg-surface text-muted';
  }
}

function engagementDotClass(variant: MilestoneDotVariant): string {
  switch (variant) {
    case 'approved':
      return 'border-2 border-active bg-active';
    case 'active':
      return 'border-2 border-warning bg-warning';
    case 'pending':
      return 'border-2 border-warning bg-warning-soft';
    default:
      return 'border-2 border-hairline bg-surface';
  }
}

function dotTextClass(variant: MilestoneDotVariant): string {
  switch (variant) {
    case 'approved':
      return 'text-on-brand';
    case 'active':
      return 'text-ink';
    case 'pending':
      return 'text-warning';
    default:
      return 'text-muted';
  }
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
  const submitSheetRef = useRef<MilestoneSubmitSheetHandle>(null);
  const approveSheetRef = useRef<MilestoneApproveSheetHandle>(null);
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
      submitSheetRef.current?.dismiss();
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
        showAppToast('Milestone approved — payment released', { type: 'success' });
        approveSheetRef.current?.dismiss();
        setApproveTarget(null);
      },
    });
  };

  if (sorted.length === 0) return null;

  return (
    <View className="w-full max-w-full gap-4">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-[13px] font-bold tracking-wide text-ink">Milestone progress</Text>
        <Text className="rounded-full border border-hairline bg-surface px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">
          {sorted.length} steps
        </Text>
      </View>
      <Text className="text-sm leading-5 text-muted">
        Work through milestones in order. Each payment releases after requester approval.
      </Text>

      {paymentDisputed ? (
        <RequestCallout tone="danger" title="Payments paused">
          <Text className="text-sm text-muted">
            Milestone payouts are on hold while this issue is being reviewed.
          </Text>
        </RequestCallout>
      ) : null}

      <View accessibilityRole="list" accessibilityLabel="Milestone schedule">
        {sorted.map((row, index) => {
          const isLast = index === sorted.length - 1;
          const dotVariant = engagementMilestoneDotVariant(row.status);
          const badgeLabel = statusBadgeLabel(row.status);
          const helperCanSubmit =
            !viewerIsRequester && !paymentDisputed && row.status === 'in_progress';
          const requesterCanReview =
            viewerIsRequester && !paymentDisputed && row.status === 'submitted';

          return (
            <View
              key={row.milestone_id}
              className={cn(
                'w-full max-w-full flex-row gap-3',
                !isLast && 'pb-3.5',
              )}
              accessibilityRole="list"
            >
              <View className="w-[30px] shrink-0 items-center">
                <View
                  className={cn(
                    'h-[30px] w-[30px] items-center justify-center rounded-full',
                    engagementDotClass(dotVariant),
                  )}
                >
                  <Text className={cn('text-xs font-extrabold', dotTextClass(dotVariant))}>
                    {row.milestone_position}
                  </Text>
                </View>
                {!isLast ? <View className="mt-1.5 min-h-4 w-0.5 flex-1 bg-hairline" /> : null}
              </View>
              <View className="min-w-0 flex-1">
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="min-w-0 flex-1 text-base font-semibold text-ink">{row.title}</Text>
                  <Text className="shrink-0 text-base font-bold text-ink">
                    {formatMoney(row.amount_major, currency)}
                  </Text>
                </View>
                {row.description ? (
                  <Text className="mt-1 text-sm leading-5 text-muted">{row.description}</Text>
                ) : null}
                {badgeLabel ? (
                  <Text
                    className={cn(
                      'mt-2 self-start rounded-full border px-2.5 py-1 text-[11px] font-bold',
                      statusBadgeClass(row.status),
                    )}
                  >
                    {badgeLabel}
                  </Text>
                ) : null}
                {helperCanSubmit || requesterCanReview ? (
                  <View className="mt-3 gap-2">
                    {helperCanSubmit ? (
                      <Button
                        label="Submit for approval"
                        size="lg"
                        variant="active"
                        onPress={() => {
                          setSubmitTarget(row);
                          submitSheetRef.current?.present();
                        }}
                      />
                    ) : null}
                    {requesterCanReview ? (
                      <Button
                        label="Approve and pay"
                        size="lg"
                        variant="active"
                        onPress={() => {
                          setApproveTarget(row);
                          approveSheetRef.current?.present();
                        }}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {submitMilestone.isError ? <InlineError error={submitMilestone.error} /> : null}

      {approveTarget ? (
        <MilestoneApproveSheet
          ref={approveSheetRef}
          milestoneTitle={approveTarget.title}
          milestonePosition={approveTarget.milestone_position}
          milestoneAmountMajor={approveTarget.amount_major}
          currency={currency}
          busy={approveMilestone.isPending}
          error={approveMilestone.isError ? approveMilestone.error : null}
          onApprove={runMilestoneApprove}
          onClose={closeApproveSheet}
          onOpenChat={conversationId && onOpenChat ? onOpenChat : undefined}
        />
      ) : null}

      {submitTarget ? (
        <MilestoneSubmitSheet
          ref={submitSheetRef}
          milestoneTitle={submitTarget.title}
          milestonePosition={submitTarget.milestone_position}
          busy={submitBusy || submitMilestone.isPending}
          onSubmit={(payload) => void runMilestoneSubmit(payload)}
        />
      ) : null}
    </View>
  );
}