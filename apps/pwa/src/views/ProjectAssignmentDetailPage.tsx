'use client';

import { useEffect, useMemo, useState } from 'react';

import { ProjectAssignmentDeadlineCard } from '@/components/project-flow/ProjectAssignmentDeadlineCard';
import { ProjectGroupChatFab } from '@/components/project-flow/ProjectGroupChatFab';
import { MilestonePlanCard } from '@/components/request-flow/MilestonePlanCard';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { RequestPersonCard } from '@/components/request-flow/RequestPersonCard';
import { RequestTitleSection } from '@/components/request-flow/RequestTitleSection';
import { ReportIssueModal } from '@/components/support/ReportIssueModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { MARKET } from '@/config';
import {
  useApproveProjectAssignmentPayout,
  useProject,
  useProjectAssignment,
  useProjectAssignmentMilestones,
  useReportProjectAssignmentProblem,
} from '@/features/projects/project-api';
import {
  projectAssignmentSectionHeading,
  projectAssignmentStatusBadge,
} from '@/features/projects/project-assignment-presentation';
import { REQUEST_REPORT_ISSUES } from '@/features/support/report-issue-options';
import { conversationHref } from '@/lib/conversation-navigation';
import { formatMoney, formatWhenHome } from '@/lib/format';
import { useRouter } from '@/lib/navigation';
import { useRouteParam } from '@/lib/route-param';
import { toUserMessage } from '@/lib/supabase/errors';
import { showAppToast } from '@/lib/toast';

function koboToMajor(kobo: number) {
  return kobo / 100;
}

export function ProjectAssignmentDetailPage() {
  const router = useRouter();
  const projectId = useRouteParam('id');
  const assignmentId = useRouteParam('assignmentId');

  const project = useProject(projectId);
  const assignment = useProjectAssignment(assignmentId);
  const milestones = useProjectAssignmentMilestones(assignmentId);

  const approvePayout = useApproveProjectAssignmentPayout(projectId);
  const reportProblem = useReportProjectAssignmentProblem(assignmentId);

  const [reportOpen, setReportOpen] = useState(false);

  const row = assignment.data;
  const projectMismatch = Boolean(row && row.project_id !== projectId);

  const milestoneItems = useMemo(() => {
    if (!milestones.data?.length) return null;
    return milestones.data.map((m) => ({
      position: m.milestone_position,
      title: m.title,
      description: '',
      amount: koboToMajor(m.amount_kobo),
    }));
  }, [milestones.data]);

  const returnTo = `/project/${projectId}/assignment/${assignmentId}`;
  const groupChatId = project.data?.group_chat_conversation_id ?? null;

  const statusBadge = row ? projectAssignmentStatusBadge(row.status) : null;
  const projectTitle = project.data?.title ?? null;
  const assignmentSectionHeading = row
    ? projectAssignmentSectionHeading(row.title, projectTitle)
    : '';

  useEffect(() => {
    if (row?.viewer_is_worker && projectId) {
      router.replace(`/project/${projectId}`);
    }
  }, [projectId, row?.viewer_is_worker, router]);

  const releasePayment = () => {
    if (!row?.creator_may_release_payment) return;
    approvePayout.mutate(
      {
        assignmentId: row.assignment_id,
        milestoneId: row.release_payment_milestone_id,
      },
      {
        onSuccess: () => {
          showAppToast('Payment released', 'success');
          void project.refetch();
        },
        onError: (error) => showAppToast(toUserMessage(error), 'danger'),
      },
    );
  };

  const submitReport = () => {
    reportProblem.mutate(
      { description: 'Reported from assignment detail' },
      {
        onSuccess: () => showAppToast('Thanks — we received your report'),
        onError: (error) => showAppToast(toUserMessage(error), 'danger'),
      },
    );
  };

  if (assignment.isPending || project.isPending) {
    return (
      <Screen className="flex min-h-0 flex-1 flex-col">
        <RequestFlowHeader title="Assignment" onBack={() => router.push(`/project/${projectId}`)} />
        <div className="flex flex-col gap-3 px-5">
          <SkeletonBlock className="h-24 w-full rounded-2xl" />
          <SkeletonBlock className="h-40 w-full rounded-2xl" />
        </div>
      </Screen>
    );
  }

  if (assignment.isError) {
    return (
      <Screen className="flex min-h-0 flex-1 flex-col">
        <RequestFlowHeader title="Assignment" onBack={() => router.push(`/project/${projectId}`)} />
        <div className="px-5">
          <InlineError error={assignment.error} onRetry={() => void assignment.refetch()} />
        </div>
      </Screen>
    );
  }

  if (row?.viewer_is_worker) {
    return (
      <Screen className="flex min-h-0 flex-1 flex-col">
        <RequestFlowHeader title="Assignment" onBack={() => router.push(`/project/${projectId}`)} />
        <div className="px-5">
          <LoadingState label="Opening project…" />
        </div>
      </Screen>
    );
  }

  if (!row || projectMismatch) {
    return (
      <Screen className="flex min-h-0 flex-1 flex-col">
        <RequestFlowHeader title="Assignment" onBack={() => router.push(`/project/${projectId}`)} />
        <EmptyState
          icon="lock-closed-outline"
          title="Assignment unavailable"
          message={
            projectMismatch
              ? 'This assignment does not belong to that project.'
              : 'You may not have access, or the assignment was removed.'
          }
        />
      </Screen>
    );
  }

  const compensationLabel = formatMoney(koboToMajor(row.compensation_total_kobo), MARKET.currency);

  return (
    <Screen className="relative flex min-h-0 flex-1 flex-col">
      <RequestFlowHeader title="Assignment" onBack={() => router.push(`/project/${projectId}`)} />

      <div
        className={`min-h-0 flex-1 overflow-y-auto px-5 ${groupChatId ? 'pb-28' : 'pb-12'}`}
      >
        <div className="flex flex-col gap-5">
          {statusBadge ? <Badge label={statusBadge.label} tone={statusBadge.tone} /> : null}

          <RequestPersonCard
            avatarPath={row.worker_avatar_path}
            name={row.worker_display_name}
            ratingAverage={row.worker_rating_average}
            ratingCount={row.worker_rating_count}
            completionPercent={null}
            onPress={
              row.worker_username
                ? () => router.push(`/u/${row.worker_username}`)
                : undefined
            }
          />

          {assignmentSectionHeading ? (
            <RequestTitleSection title={assignmentSectionHeading} description={row.description} />
          ) : row.description?.trim() ? (
            <p className="text-base leading-6 text-muted">{row.description.trim()}</p>
          ) : null}

          <p className="text-xl font-bold text-ink">{compensationLabel}</p>

          {row.deliverables ? (
            <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-subtle">Deliverables</p>
              <p className="whitespace-pre-wrap text-base text-ink">{row.deliverables}</p>
            </div>
          ) : null}

          <ProjectAssignmentDeadlineCard
            dueAt={row.due_at}
            status={row.status}
            commencedAt={row.commenced_at}
            proposedDeliveryDurationValue={row.proposed_delivery_duration_value}
            proposedDeliveryDurationUnit={row.proposed_delivery_duration_unit}
          />

          {!row.reservation_secured ? (
            <RequestCallout tone="warning" title="Compensation not secured">
              <p className="text-sm text-muted">
                Secure compensation from the project pool before work can start.
              </p>
            </RequestCallout>
          ) : null}

          {row.has_open_dispute ? (
            <RequestCallout tone="danger" title="Open dispute">
              <p className="text-sm text-muted">Payment release is paused while a dispute is open.</p>
            </RequestCallout>
          ) : null}

          {milestoneItems && milestoneItems.length >= 2 ? (
            <MilestonePlanCard
              paymentStructure="milestone"
              totalMajor={koboToMajor(row.compensation_total_kobo)}
              milestones={milestoneItems}
              currency={MARKET.currency}
              heading="Milestone plan"
              variant="default"
            />
          ) : null}

          {milestones.data && milestones.data.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink">Milestone progress</p>
              <ul className="flex flex-col gap-2">
                {milestones.data.map((milestone) => (
                  <li
                    key={milestone.milestone_id}
                    className="rounded-xl border border-hairline bg-surface px-3 py-2"
                  >
                    <p className="font-medium text-ink">
                      {milestone.milestone_position}. {milestone.title}
                    </p>
                    <p className="text-sm capitalize text-muted">
                      {milestone.status.replaceAll('_', ' ')} ·{' '}
                      {formatMoney(koboToMajor(milestone.amount_kobo), MARKET.currency)}
                      {milestone.due_at ? ` · due ${formatWhenHome(milestone.due_at)}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 pt-2">
            {row.viewer_is_creator && row.creator_may_release_payment ? (
              <Button
                label={approvePayout.isPending ? 'Releasing…' : 'Release payment'}
                size="lg"
                corner="2xl"
                loading={approvePayout.isPending}
                onClick={releasePayment}
              />
            ) : null}

            {row.viewer_may_report ? (
              <Button
                label="Report an issue"
                variant="danger"
                size="lg"
                corner="2xl"
                onClick={() => setReportOpen(true)}
              />
            ) : null}
          </div>
        </div>
      </div>

      {groupChatId ? (
        <ProjectGroupChatFab
          unreadCount={project.data?.group_chat_unread_count ?? 0}
          onPress={() => router.push(conversationHref(groupChatId, returnTo))}
        />
      ) : null}

      <ReportIssueModal
        open={reportOpen}
        issues={REQUEST_REPORT_ISSUES}
        onClose={() => setReportOpen(false)}
        onSubmit={submitReport}
      />
    </Screen>
  );
}