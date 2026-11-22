import { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';

import { ProfileReviewRow } from '@/components/profile/ProfileReviewRow';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { StarRating } from '@/components/ui/Stars';
import { ReviewListSkeleton } from '@/components/ui/content-skeletons';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import { usePullToRefresh } from '@/lib/query/use-pull-to-refresh';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { useProfile } from '@/features/profile/api';
import { useMyReceivedRatings } from '@/features/profile/reviews-api';
import { receivedRatingDestinationPath } from '@/features/profile/received-rating-navigation';
import { useMyResponses } from '@/features/requests/responses-api';
import { useMyRequests } from '@/features/requests/requester-api';

export default function ProfileReviewsScreen() {
  const profile = useProfile();
  const reviews = useMyReceivedRatings();
  const myRequests = useMyRequests();
  const myResponses = useMyResponses();

  const myRequestIds = useMemo(
    () => new Set(myRequests.data?.map((row) => row.request_id) ?? []),
    [myRequests.data],
  );
  useQueryErrorToast(reviews);

  const onPullRefresh = useCallback(
    () => Promise.all([profile.refetch(), reviews.refetch()]),
    [profile, reviews],
  );
  const { refreshing, onRefresh } = usePullToRefresh(onPullRefresh);

  if (showQuerySkeleton(profile) || showQuerySkeleton(reviews) || showQuerySkeleton(myResponses)) {
    return (
      <Screen>
        <Header title="Reviews" onBack={() => router.back()} />
        <ReviewListSkeleton />
      </Screen>
    );
  }

  const items = reviews.data ?? [];
  const ratingCount = profile.data?.rating_count ?? 0;
  const ratingAverage =
    ratingCount > 0 && profile.data?.rating_average != null ? profile.data.rating_average : null;

  return (
    <Screen>
      <Header title="Reviews" onBack={() => router.back()} />

      {reviews.isError ? (
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-5 pb-12"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <InlineError error={reviews.error} />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 px-5 pb-12 pt-2"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View className="gap-1">
            <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">Reputation</Text>
            <View className="flex-row items-center justify-between gap-4">
              <Text className="shrink text-xl font-bold text-ink">What people say</Text>
              {ratingAverage !== null ? (
                <StarRating average={ratingAverage} count={ratingCount} size="md" />
              ) : null}
            </View>
          </View>

          {items.length === 0 ? (
            <EmptyState
              icon="star-outline"
              title="No reviews yet"
              message="Complete work and your partners can leave feedback after requests and projects."
            />
          ) : (
            <View className="overflow-hidden rounded-2xl border border-hairline bg-elevated px-4">
              {items.map((review, index) => (
                <ProfileReviewRow
                  key={review.ratingId}
                  review={review}
                  showDivider={index > 0}
                  destinationPath={receivedRatingDestinationPath(review, {
                    myRequestIds,
                    myResponses: myResponses.data,
                  })}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}