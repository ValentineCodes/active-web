'use client';

import { useCallback, useMemo, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

import { useRouter } from '@/lib/navigation';
import { conversationHref } from '@/lib/conversation-navigation';

import { ActivityStatusFilter } from '@/components/activity/ActivityStatusFilter';
import { ResponseCard } from '@/components/ResponseCard';
import {
  PersonProfileSheet,
  type PersonProfilePreview,
} from '@/components/profile/PersonProfileSheet';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { MARKET } from '@/config';
import {
  PROJECT_RESPONSE_FILTER_OPTIONS,
  projectResponseCardStatus,
  projectResponsesForFilter,
  type ProjectResponseFilter,
  type ProjectResponseListRow,
} from '@/features/projects/project-response-list';
import { useOpenProjectPreHandshakeConversation } from '@/features/projects/project-conversation-api';
import { showAppToast } from '@/lib/toast';

export function ProjectResponsesPanel({
  responses,
  allowDiscuss,
  projectId,
}: {
  responses: UseQueryResult<ProjectResponseListRow[]>;
  allowDiscuss?: boolean;
  projectId: string;
}) {
  const router = useRouter();
  const openProjectChat = useOpenProjectPreHandshakeConversation();
  const [filter, setFilter] = useState<ProjectResponseFilter>('awaiting_review');
  const [profilePreview, setProfilePreview] = useState<PersonProfilePreview | null>(null);
  const showDiscuss = Boolean(allowDiscuss && filter === 'awaiting_review');

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

  const visibleRows = useMemo(
    () => projectResponsesForFilter(responses.data ?? [], filter),
    [filter, responses.data],
  );
  const statusBadge = projectResponseCardStatus(filter);

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
          title={filter === 'awaiting_review' ? 'No responses yet' : 'No one assigned yet'}
          message={
            filter === 'awaiting_review'
              ? 'When workers respond to your project, their offers show up here for review.'
              : 'Accepted workers appear here once you assign them.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visibleRows.map((row) => (
            <li key={row.assignment_id}>
              <ResponseCard
                displayName={row.display_name}
                avatarPath={row.avatar_path}
                ratingAverage={row.rating_average}
                ratingCount={row.rating_count}
                completionPercent={row.completion_percent}
                onViewProfile={() =>
                  setProfilePreview({
                    userId: row.worker_id,
                    displayName: row.display_name,
                    avatarPath: row.avatar_path,
                    bio: row.bio,
                    ratingAverage: row.rating_average,
                    ratingCount: row.rating_count,
                    completionPercent: row.completion_percent,
                    identityVerified: Boolean(row.identity_verified),
                  })
                }
                message={row.message}
                quotedAmount={row.quoted_amount}
                currency={MARKET.currency}
                createdAt={row.created_at}
                responderAvailable={Boolean(row.responder_available)}
                statusLabel={statusBadge.label}
                statusTone={statusBadge.tone}
                proposedDeliveryDurationValue={row.proposed_delivery_duration_value}
                proposedDeliveryDurationUnit={row.proposed_delivery_duration_unit}
                proposedDeliveryAt={row.proposed_delivery_at}
                proposedDeliveryTimezone={row.proposed_delivery_timezone}
                onDiscussPress={
                  showDiscuss ? () => discussAssignment(row.assignment_id) : undefined
                }
                discussLoading={
                  showDiscuss &&
                  openProjectChat.isPending &&
                  openProjectChat.variables === row.assignment_id
                }
              />
            </li>
          ))}
        </ul>
      )}

      <PersonProfileSheet
        open={profilePreview !== null}
        profile={profilePreview}
        onClose={() => setProfilePreview(null)}
      />
    </div>
  );
}