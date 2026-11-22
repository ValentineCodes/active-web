'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { ProjectAssignmentSubmitSheet } from '@/components/project-flow/ProjectAssignmentSubmitSheet';
import { Button } from '@/components/ui/Button';
import type { ProjectAssignmentDetail, ProjectAssignmentMilestoneRow } from '@/features/projects/project-api';
import { useStartProjectAssignment } from '@/features/projects/project-api';
import { queryKeys } from '@/lib/query/keys';
import { toUserMessage } from '@/lib/supabase/errors';
import { showAppToast } from '@/lib/toast';
import { useRouter } from '@/lib/navigation';
import { conversationHref } from '@/lib/conversation-navigation';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import {
  resolveWorkerMaySubmit,
  workerAssignmentAwaitingSubmissionReview,
} from '@/features/projects/project-assignment-presentation';

function submitTargetMilestoneId(milestones: ProjectAssignmentMilestoneRow[] | undefined) {
  if (!milestones?.length) return undefined;
  const open = milestones.find(
    (m) => m.status === 'in_progress' || m.status === 'revision_requested',
  );
  return open?.milestone_id;
}

export function ProjectWorkerAssignmentActions({
  row,
  milestones,
  projectId,
  assignmentTitle,
}: {
  row: ProjectAssignmentDetail;
  milestones?: ProjectAssignmentMilestoneRow[];
  projectId?: string;
  assignmentTitle?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const start = useStartProjectAssignment();
  const [submitOpen, setSubmitOpen] = useState(false);

  const milestoneId = useMemo(
    () =>
      row.payment_structure === 'milestone' ? submitTargetMilestoneId(milestones) : undefined,
    [milestones, row.payment_structure],
  );

  if (!row.viewer_is_worker) return null;

  const canCommence =
    row.status === 'accepted' && row.reservation_secured && !row.has_open_dispute;
  const workerMaySubmit = resolveWorkerMaySubmit(row, milestones);
  const awaitingReview = workerAssignmentAwaitingSubmissionReview(row, milestones);
  const canSubmit =
    row.viewer_is_worker &&
    workerMaySubmit &&
    row.status === 'commenced' &&
    !row.has_open_dispute &&
    (row.payment_structure === 'single' ||
      (row.payment_structure === 'milestone' && Boolean(milestoneId)));

  const onSubmitted = async (result: { conversationId: string | null }) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.projectAssignment(row.assignment_id) });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.projectAssignmentMilestones(row.assignment_id),
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.myProjectAssignments });
    if (projectId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
    }
    if (result.conversationId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.requestMessages(result.conversationId),
      });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {canCommence ? (
        <Button
          label={start.isPending ? 'Starting…' : 'Commence work'}
          variant="active"
          size="lg"
          corner="2xl"
          loading={start.isPending}
          onClick={() =>
            start.mutate(row.assignment_id, {
              onSuccess: () => showAppToast('Work commenced', 'success'),
              onError: (error) => showAppToast(toUserMessage(error), 'danger'),
            })
          }
        />
      ) : null}

      {row.status === 'accepted' && !row.reservation_secured ? (
        <p className="text-sm text-muted">
          Waiting for the project creator to secure your compensation before you can commence.
        </p>
      ) : null}

      {awaitingReview ? (
        <RequestCallout tone="warning" title="Awaiting review">
          <p className="text-sm text-ink">
            Your deliverables are in the project team chat. The creator will review them and release
            payment when satisfied.
          </p>
          {row.payment_structure === 'milestone' && milestones?.length ? (
            <p className="text-sm text-muted">
              Current milestone:{' '}
              {milestones.find((m) => m.status === 'submitted')?.title ??
                'Submitted — pending approval'}
            </p>
          ) : null}
        </RequestCallout>
      ) : null}

      {canSubmit ? (
        <Button
          label="Submit"
          variant="active"
          size="lg"
          corner="2xl"
          onClick={() => setSubmitOpen(true)}
        />
      ) : null}

      <ProjectAssignmentSubmitSheet
        open={submitOpen}
        assignmentId={row.assignment_id}
        milestoneId={milestoneId}
        assignmentTitle={assignmentTitle ?? row.title}
        onClose={() => setSubmitOpen(false)}
        onSubmitted={(result) => {
          void onSubmitted(result).then(() => {
          if (result.conversationId) {
            const returnTo = `/project/${projectId ?? row.project_id}`;
            router.push(conversationHref(result.conversationId, returnTo));
          }
          });
        }}
      />
    </div>
  );
}