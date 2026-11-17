'use client';

import { useMemo } from 'react';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { ProfileReviewRow } from '@/components/profile/ProfileReviewRow';
import { StarRating } from '@/components/ui/Stars';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { useMyProfile } from '@/features/profile/api';
import { useMyReceivedRatings } from '@/features/profile/reviews-api';
import { participationRequestPath } from '@/features/requests/activity-list';
import { useMyResponses } from '@/features/requests/responses-api';
import { useMyRequests } from '@/features/requests/requester-api';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';

export function ReviewsPage() {
  const profile = useMyProfile();
  const reviews = useMyReceivedRatings();
  const myRequests = useMyRequests();
  const myResponses = useMyResponses();

  const myRequestIds = useMemo(
    () => new Set(myRequests.data?.map((row) => row.request_id) ?? []),
    [myRequests.data],
  );

  if (showQuerySkeleton(profile) || showQuerySkeleton(reviews) || showQuerySkeleton(myResponses)) {
    return (
      <FlowScreen title="Reviews" backTo="/profile">
        <LoadingState />
      </FlowScreen>
    );
  }

  if (reviews.isError) {
    return (
      <FlowScreen title="Reviews" backTo="/profile">
        <InlineError error={reviews.error} />
      </FlowScreen>
    );
  }

  const items = reviews.data ?? [];
  const ratingCount = profile.data?.rating_count ?? 0;
  const ratingAverage =
    ratingCount > 0 && profile.data?.rating_average != null ? profile.data.rating_average : null;

  return (
    <FlowScreen title="Reviews" backTo="/profile" bodyClassName="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Reputation</p>
        <div className="flex flex-row items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-ink">What people say</h2>
          {ratingAverage !== null ? (
            <StarRating average={ratingAverage} count={ratingCount} size="md" />
          ) : null}
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState
          layout="list"
          icon="star-outline"
          title="No reviews yet"
          message="Complete work and your partners can leave feedback after each request."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-hairline bg-elevated px-4">
          {items.map((review) => (
            <ProfileReviewRow
              key={review.ratingId}
              review={review}
              requestPath={participationRequestPath(review.requestId, {
                myRequestIds,
                myResponses: myResponses.data,
              })}
            />
          ))}
        </div>
      )}
    </FlowScreen>
  );
}