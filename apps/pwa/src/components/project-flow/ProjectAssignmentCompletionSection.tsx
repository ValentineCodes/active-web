'use client';

import { format } from 'date-fns';

import { RequestCompletionCard } from '@/components/request-flow/RequestCompletionCard';
import { Button } from '@/components/ui/Button';

export function ProjectAssignmentCompletionSection({
  completedAt,
  receivedRatingStars,
  receivedRatingComment,
  viewerMayRate,
  viewerIsCreator,
  onRate,
}: {
  completedAt: string | null;
  receivedRatingStars?: number | null;
  receivedRatingComment?: string | null;
  viewerMayRate: boolean;
  viewerIsCreator: boolean;
  onRate: () => void;
}) {
  const completedAtLabel = completedAt
    ? format(new Date(completedAt), "EEEE, d MMM 'at' h:mm a")
    : 'Completed';

  return (
    <div className="flex flex-col gap-3">
      <RequestCompletionCard
        heading="Assignment complete"
        completedAtLabel={completedAtLabel}
        ratingStars={receivedRatingStars}
        ratingComment={receivedRatingComment}
      />
      {viewerMayRate ? (
        <Button
          label={viewerIsCreator ? 'Rate them' : 'Rate the project creator'}
          variant="active"
          size="lg"
          corner="2xl"
          onClick={onRate}
        />
      ) : null}
    </div>
  );
}