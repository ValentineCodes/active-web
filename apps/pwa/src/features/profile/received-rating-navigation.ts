import { participationRequestPath } from '@/features/requests/activity-list';

import type { ReceivedRating } from '@/features/profile/reviews-api';

export function receivedRatingDestinationPath(
  review: ReceivedRating,
  input: Parameters<typeof participationRequestPath>[1],
): string {
  if (review.projectAssignmentId && review.projectId) {
    return `/project/${review.projectId}/assignment/${review.projectAssignmentId}`;
  }
  if (review.requestId) {
    return participationRequestPath(review.requestId, input);
  }
  return '/profile';
}