'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { ProjectAssignmentSubmitSheet } from '@/components/project-flow/ProjectAssignmentSubmitSheet';
import { Button } from '@/components/ui/Button';
import { MARKET } from '@/config';
import type { ProjectAssignmentDetail, ProjectAssignmentMilestoneRow } from '@/features/projects/project-api';
import { useStartProjectAssignment } from '@/features/projects/project-api';
import { queryKeys } from '@/lib/query/keys';
import { toUserMessage } from '@/lib/supabase/errors';
import { showAppToast } from '@/lib/toast';
import { useRouter } from '@/lib/navigation';
import { conversationHref } from '@/lib/conversation-navigation';

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
}: {
  row: ProjectAssignmentDetail;
  milestones?: ProjectAssignmentMilestoneRow[];
  projectId?: string;
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
  const canSubmit =
    row.status === 'commenced' &&
    !row.has_open_dispute &&
    (row.payment_structure === 'single' ||
      (row.payment_structure === 'milestone' && Boolean(milestoneId)));

  const onSubmitted = (result: { conversationId: string | null }) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.projectAssignment(row.assignment_id) });
    void queryClient.invalidateQueries({
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

      {canSubmit ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-hairline bg-surface p-4">
          <p className="text-base font-semibold text-ink">Submit deliverables</p>
          <p className="text-sm text-muted">
            Formal submissions are posted to the project team chat with files attached. Regular chat
            messages do not count as submissions.
          </p>
          {row.payment_structure === 'milestone' && milestoneId ? (
            <p className="text-xs text-subtle">
              Milestone:{' '}
              {milestones?.find((m) => m.milestone_id === milestoneId)?.title ?? 'Current step'}
            </p>
          ) : null}
          <Button
            label="Submit work"
            size="lg"
            corner="2xl"
            onClick={() => setSubmitOpen(true)}
          />
        </div>
      ) : null}

      {row.status === 'completed' ? (
        <p className="text-sm text-muted">
          This assignment is complete. Payment total:{' '}
          {MARKET.currency} {(row.compensation_total_kobo / 100).toLocaleString()}.
        </p>
      ) : null}

      <ProjectAssignmentSubmitSheet
        open={submitOpen}
        assignmentId={row.assignment_id}
        milestoneId={milestoneId}
        assignmentTitle={row.title}
        onClose={() => setSubmitOpen(false)}
        onSubmitted={(result) => {
          onSubmitted(result);
          if (result.conversationId) {
            const returnTo = `/project/${projectId ?? row.project_id}/assignment/${row.assignment_id}`;
            router.push(conversationHref(result.conversationId, returnTo));
          }
        }}
      />
    </div>
  );
}