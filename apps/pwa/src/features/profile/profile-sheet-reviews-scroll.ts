import { useCallback, type UIEvent } from 'react';

import type { useUserReceivedRatingsInfinite } from '@/features/profile/reviews-api';

const SCROLL_LOAD_THRESHOLD_PX = 240;

type ReviewsQuery = Pick<
  ReturnType<typeof useUserReceivedRatingsInfinite>,
  'hasNextPage' | 'isFetchingNextPage' | 'fetchNextPage'
>;

export function useProfileSheetReviewsScrollLoad(query: ReviewsQuery) {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  return useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (!hasNextPage || isFetchingNextPage) return;
      const el = event.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_LOAD_THRESHOLD_PX) {
        void fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );
}