import { useMemo, useRef, useState } from 'react';
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
  projectResponseCardStatus,
  projectResponsesForFilter,
  type ProjectResponseFilter,
  type ProjectResponseListRow,
} from '@/features/projects/project-response-list';

export function ProjectResponsesPanel({
  responses,
}: {
  responses: UseQueryResult<ProjectResponseListRow[]>;
}) {
  const [filter, setFilter] = useState<ProjectResponseFilter>('awaiting_review');
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
  const statusBadge = projectResponseCardStatus(filter);

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
          title={filter === 'awaiting_review' ? 'No responses yet' : 'No one assigned yet'}
          message={
            filter === 'awaiting_review'
              ? 'When workers respond to your project, their offers show up here for review.'
              : 'Accepted workers appear here once you assign them.'
          }
        />
      ) : (
        <View className="gap-3">
          {visibleRows.map((row) => (
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
                statusLabel={statusBadge.label}
                statusTone={statusBadge.tone}
                proposedDeliveryDurationValue={row.proposed_delivery_duration_value}
                proposedDeliveryDurationUnit={row.proposed_delivery_duration_unit}
                proposedDeliveryAt={row.proposed_delivery_at}
                proposedDeliveryTimezone={row.proposed_delivery_timezone}
              />
            </View>
          ))}
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