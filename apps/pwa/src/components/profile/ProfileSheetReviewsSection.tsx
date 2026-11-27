'use client';

import { useMemo } from 'react';

import { ProfileReviewRow } from '@/components/profile/ProfileReviewRow';
import { InlineError } from '@/components/ui/StateView';
import { useUserReceivedRatingsInfinite } from '@/features/profile/reviews-api';

type ReviewsQuery = ReturnType<typeof useUserReceivedRatingsInfinite>;

export function ProfileSheetReviewsSection({ query, enabled }: { query: ReviewsQuery; enabled: boolean }) {
  const items = useMemo(() => query.data?.pages.flat() ?? [], [query.data?.pages]);

  if (!enabled) return null;

  if (query.isPending) {
    return (
      <section aria-busy="true" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-ink">Reviews</h3>
        <p className="text-sm text-muted">Loading reviews…</p>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-ink">Reviews</h3>
        <InlineError error={query.error} onRetry={() => void query.refetch()} />
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-1">
      <h3 className="pb-1 text-sm font-semibold text-ink">Reviews</h3>
      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface px-4">
        {items.map((review) => (
          <ProfileReviewRow key={review.ratingId} review={review} readonly />
        ))}
      </div>
      {query.isFetchingNextPage ? (
        <p className="py-2 text-center text-xs text-muted">Loading more…</p>
      ) : null}
    </section>
  );
}