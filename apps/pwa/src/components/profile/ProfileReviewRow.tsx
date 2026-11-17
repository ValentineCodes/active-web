'use client';

import { AvatarWithViewer } from '@/components/profile/AvatarWithViewer';
import { cn } from '@/lib/cn';
import { formatAgo } from '@/lib/format';

import type { ReceivedRating } from '@/features/profile/reviews-api';

export function ProfileReviewRow({ review }: { review: ReceivedRating }) {
  const name = review.raterDisplayName?.trim() || 'Community member';
  const comment = review.comment?.trim();
  const hasComment = Boolean(comment);

  return (
    <article
      className={cn(
        'grid gap-3 border-b border-hairline py-5 last:border-b-0',
        hasComment ? 'grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto]' : 'grid-cols-[minmax(0,1fr)_auto]',
      )}
    >
      {hasComment ? (
        <p className="col-start-1 row-start-1 text-base leading-6 text-ink">“{comment}”</p>
      ) : null}
      <footer
        className={cn(
          'col-start-1 flex min-w-0 flex-row items-center gap-3',
          hasComment ? 'row-start-2' : 'row-start-1',
        )}
      >
        <AvatarWithViewer path={review.raterAvatarPath} name={name} size="sm" />
        <span className="min-w-0 flex flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-ink">{name}</span>
          <span className="text-xs text-muted">{formatAgo(review.createdAt)}</span>
        </span>
      </footer>
      <ReviewStars
        stars={review.stars}
        className={cn(
          'col-start-2 self-center',
          hasComment ? 'row-start-2 justify-self-end' : 'row-start-1 justify-self-end',
        )}
      />
    </article>
  );
}

function ReviewStars({ stars, className }: { stars: number; className?: string }) {
  const value = Math.min(5, Math.max(1, Math.round(stars)));
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 text-sm font-bold text-warning', className)}
      role="img"
      aria-label={`${value} out of 5 stars`}
    >
      <span aria-hidden>★</span>
      <span aria-hidden>{value}</span>
    </span>
  );
}