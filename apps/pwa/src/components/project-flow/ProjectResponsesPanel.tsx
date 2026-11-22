'use client';

import { useCallback, useMemo, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

import { useRouter } from '@/lib/navigation';
import { conversationHref } from '@/lib/conversation-navigation';

import { ActivityStatusFilter } from '@/components/activity/ActivityStatusFilter';
import { ResponseCard } from '@/components/ResponseCard';
import {
  ResponderProfileSheet,
  type ResponderProfileSheetActions,
} from '@/components/request-flow/ResponderProfileSheet';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { MARKET } from '@/config';
import {
  PROJECT_RESPONSE_FILTER_OPTIONS,
  projectResponseFilterEmptyState,
  projectResponseCreatorMayDiscuss,
  projectResponseCreatorMayReview,
  projectResponseRowCardStatus,
  projectResponseRowMayOpenAssignment,
  projectResponsesForFilter,
  type ProjectResponseFilter,
  type ProjectResponseListRow,
} from '@/features/projects/project-response-list';
import { useOpenProjectPreHandshakeConversation } from '@/features/projects/project-conversation-api';
import {
  useAcceptProjectWorkerResponse,
  useRejectProjectWorkerResponse,
} from '@/features/projects/project-responses-api';
import { showAppToast } from '@/lib/toast';
import { toUserMessage } from '@/lib/supabase/errors';

type ProjectResponderProfilePreview = {
  userId: string;
  displayName: string | null;
  avatarPath: string | null;
  bio: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  completionPercent: number | null;
  pendingResponse?: {
    assignmentId: string;
    responderAvailable: boolean;
  };
};

export function ProjectResponsesPanel({
  responses,
  allowDiscuss,
  allowReview,
  projectId,
}: {
  responses: UseQueryResult<ProjectResponseListRow[]>;
  allowDiscuss?: boolean;
  /** Creator-only accept/reject in the response sheet */
  allowReview?: boolean;
  projectId: string;
}) {
  const router = useRouter();
  const openProjectChat = useOpenProjectPreHandshakeConversation();
  const acceptResponse = useAcceptProjectWorkerResponse(projectId);
  const rejectResponse = useRejectProjectWorkerResponse(projectId);
  const [filter, setFilter] = useState<ProjectResponseFilter>('all');
  const [profilePreview, setProfilePreview] = useState<ProjectResponderProfilePreview | null>(null);

  const discussAssignment = useCallback(
    (assignmentId: string) => {
      void openProjectChat
        .mutateAsync(assignmentId)
        .then((conversationId) => {
          router.push(conversationHref(conversationId, `/project/${projectId}`));
        })
        .catch((error) => {
          showAppToast(error instanceof Error ? error.message : 'Could not open chat', 'danger');
        });
    },
    [openProjectChat, projectId, router],
  );

  const navigateToAssignment = useCallback(
    (assignmentId: string) => {
      router.push(`/project/${projectId}/assignment/${assignmentId}`);
    },
    [projectId, router],
  );

  const visibleRows = useMemo(
    () => projectResponsesForFilter(responses.data ?? [], filter),
    [filter, responses.data],
  );
  const emptyCopy = projectResponseFilterEmptyState(filter);

  const dismissPreview = useCallback(() => {
    setProfilePreview(null);
  }, []);

  const responderProfileFromRow = useCallback(
    (row: ProjectResponseListRow, allowSelection: boolean): ProjectResponderProfilePreview => ({
      userId: row.worker_id,
      displayName: row.display_name,
      avatarPath: row.avatar_path,
      bio: row.bio,
      ratingAverage: row.rating_average,
      ratingCount: row.rating_count,
      completionPercent: row.completion_percent,
      pendingResponse: allowSelection
        ? {
            assignmentId: row.assignment_id,
            responderAvailable: Boolean(row.responder_available),
          }
        : undefined,
    }),
    [],
  );

  const profileSheetActions: ResponderProfileSheetActions | undefined =
    profilePreview?.pendingResponse && allowReview
      ? {
          responderAvailable: profilePreview.pendingResponse.responderAvailable,
          acceptLoading: acceptResponse.isPending,
          declineLoading: rejectResponse.isPending,
          onAccept: () => {
            const assignmentId = profilePreview.pendingResponse!.assignmentId;
            acceptResponse.mutate(assignmentId, {
              onSuccess: () => {
                dismissPreview();
                showAppToast('Worker assigned', 'success');
              },
              onError: (error) => {
                showAppToast(toUserMessage(error), 'danger');
                void responses.refetch();
              },
            });
          },
          onDecline: (reason) => {
            const assignmentId = profilePreview.pendingResponse!.assignmentId;
            rejectResponse.mutate(
              { assignmentId, reason },
              {
                onSuccess: () => {
                  dismissPreview();
                  showAppToast('Declined');
                },
                onError: (error) => {
                  showAppToast(toUserMessage(error), 'danger');
                  void responses.refetch();
                },
              },
            );
          },
        }
      : undefined;

  if (responses.isPending) {
    return <SkeletonBlock className="h-32 w-full rounded-2xl" />;
  }
  if (responses.isError) {
    return <InlineError error={responses.error} onRetry={() => void responses.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-5">
        <ActivityStatusFilter
          value={filter}
          options={PROJECT_RESPONSE_FILTER_OPTIONS}
          onChange={setFilter}
        />
      </div>

      {visibleRows.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={emptyCopy.title}
          message={emptyCopy.message}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visibleRows.map((row) => {
            const rowStatus = projectResponseRowCardStatus(row);
            return (
            <li key={row.assignment_id}>
              <ResponseCard
                displayName={row.display_name}
                avatarPath={row.avatar_path}
                ratingAverage={row.rating_average}
                ratingCount={row.rating_count}
                completionPercent={row.completion_percent}
                onViewProfile={() =>
                  setProfilePreview(
                    responderProfileFromRow(
                      row,
                      Boolean(allowReview && projectResponseCreatorMayReview(row)),
                    ),
                  )
                }
                message={row.message}
                quotedAmount={row.quoted_amount}
                currency={MARKET.currency}
                createdAt={row.created_at}
                responderAvailable={Boolean(row.responder_available)}
                statusLabel={rowStatus.label}
                statusTone={rowStatus.tone}
                proposedDeliveryDurationValue={row.proposed_delivery_duration_value}
                proposedDeliveryDurationUnit={row.proposed_delivery_duration_unit}
                proposedDeliveryAt={row.proposed_delivery_at}
                proposedDeliveryTimezone={row.proposed_delivery_timezone}
                onDiscussPress={
                  allowDiscuss && projectResponseCreatorMayDiscuss(row)
                    ? () => discussAssignment(row.assignment_id)
                    : undefined
                }
                discussLoading={
                  allowDiscuss &&
                  projectResponseCreatorMayDiscuss(row) &&
                  openProjectChat.isPending &&
                  openProjectChat.variables === row.assignment_id
                }
                onOpenDetail={
                  projectResponseRowMayOpenAssignment(row)
                    ? () => navigateToAssignment(row.assignment_id)
                    : undefined
                }
              />
            </li>
            );
          })}
        </ul>
      )}

      <ResponderProfileSheet
        open={profilePreview != null}
        onClose={dismissPreview}
        userId={profilePreview?.userId}
        displayName={profilePreview?.displayName ?? null}
        avatarPath={profilePreview?.avatarPath ?? null}
        bio={profilePreview?.bio}
        ratingAverage={profilePreview?.ratingAverage ?? null}
        ratingCount={profilePreview?.ratingCount ?? null}
        completionPercent={profilePreview?.completionPercent}
        responseActions={profileSheetActions}
      />
    </div>
  );
}