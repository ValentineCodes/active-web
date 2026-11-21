import { useCallback, useMemo, useRef, useState } from 'react';
import { router, type Href } from 'expo-router';
import { View } from 'react-native';
import type { UseQueryResult } from '@tanstack/react-query';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { ActivityStatusFilter } from '@/components/activity/ActivityStatusFilter';
import { ResponseCard } from '@/components/ResponseCard';
import { PersonProfileBottomSheet } from '@/components/PersonProfileBottomSheet';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { MARKET } from '@/config';
import {
  PROJECT_RESPONSE_FILTER_OPTIONS,
  projectResponseFilterEmptyState,
  projectResponseRowCardStatus,
  projectResponsesForFilter,
  type ProjectResponseFilter,
  type ProjectResponseListRow,
} from '@/features/projects/project-response-list';
import { useOpenProjectPreHandshakeConversation } from '@/features/projects/project-conversation-api';
import { showAppToast } from '@/lib/toast';

export function ProjectResponsesPanel({
  responses,
  allowDiscuss,
}: {
  responses: UseQueryResult<ProjectResponseListRow[]>;
  allowDiscuss?: boolean;
}) {
  const openProjectChat = useOpenProjectPreHandshakeConversation();
  const [filter, setFilter] = useState<ProjectResponseFilter>('all');
  const profileSheetRef = useRef<BottomSheetModal>(null);
  const [profilePreview, setProfilePreview] = useState<{
    userId: string;
    displayName: string | null;
    avatarPath: string | null;
    bio: string | null;
    ratingAverage: number | null;
    ratingCount: number | null;
    completionPercent: number | null;
    identityVerified: boolean;
  } | null>(null);

  const visibleRows = useMemo(
    () => projectResponsesForFilter(responses.data ?? [], filter),
    [filter, responses.data],
  );
  const emptyCopy = projectResponseFilterEmptyState(filter);
  const showDiscuss = Boolean(allowDiscuss && filter === 'awaiting_review');

  const discussAssignment = useCallback(
    (assignmentId: string) => {
      void openProjectChat
        .mutateAsync(assignmentId)
        .then((conversationId) => {
          router.push(`/conversation/${conversationId}` as Href);
        })
        .catch((error) => {
          showAppToast(error instanceof Error ? error.message : 'Could not open chat', 'warning');
        });
    },
    [openProjectChat],
  );

  if (responses.isPending) {
    return <SkeletonBlock className="h-32 w-full rounded-2xl" />;
  }
  if (responses.isError) {
    return <InlineError error={responses.error} onRetry={() => void responses.refetch()} />;
  }

  return (
    <View className="gap-3">
      <ActivityStatusFilter
        value={filter}
        options={PROJECT_RESPONSE_FILTER_OPTIONS}
        onChange={setFilter}
      />

      {visibleRows.length === 0 ? (
        <EmptyState
          layout="list"
          icon="people-outline"
          title={emptyCopy.title}
          message={emptyCopy.message}
        />
      ) : (
        <View className="gap-3">
          {visibleRows.map((row) => {
            const rowStatus = projectResponseRowCardStatus(row);
            return (
            <View key={row.assignment_id}>
              <ResponseCard
                displayName={row.display_name}
                avatarPath={row.avatar_path}
                ratingAverage={row.rating_average}
                ratingCount={row.rating_count}
                completionPercent={row.completion_percent}
                identityVerified={Boolean(row.identity_verified)}
                onViewProfile={() => {
                  setProfilePreview({
                    userId: row.worker_id,
                    displayName: row.display_name,
                    avatarPath: row.avatar_path,
                    bio: row.bio,
                    ratingAverage: row.rating_average,
                    ratingCount: row.rating_count,
                    completionPercent: row.completion_percent,
                    identityVerified: Boolean(row.identity_verified),
                  });
                  profileSheetRef.current?.present();
                }}
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
                  showDiscuss ? () => discussAssignment(row.assignment_id) : undefined
                }
                discussLoading={
                  showDiscuss &&
                  openProjectChat.isPending &&
                  openProjectChat.variables === row.assignment_id
                }
              />
            </View>
            );
          })}
        </View>
      )}

      <PersonProfileBottomSheet
        sheetRef={profileSheetRef}
        userId={profilePreview?.userId ?? ''}
        displayName={profilePreview?.displayName ?? null}
        avatarPath={profilePreview?.avatarPath ?? null}
        bio={profilePreview?.bio}
        ratingAverage={profilePreview?.ratingAverage ?? null}
        ratingCount={profilePreview?.ratingCount ?? null}
        completionPercent={profilePreview?.completionPercent}
        identityVerified={profilePreview?.identityVerified}
      />
    </View>
  );
}