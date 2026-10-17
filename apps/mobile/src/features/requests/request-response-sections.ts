import type { Database } from '@/lib/supabase/database.types';

type RequestStatus = Database['public']['Enums']['request_status'];

export type RequestResponseListRow = {
  response_id: string;
  status: Database['public']['Enums']['response_status'];
};

export function requesterCanAcceptResponses(
  requestStatus: RequestStatus,
  options: { isAwaitingReview: boolean; isExpiredRequest: boolean },
): boolean {
  if (options.isExpiredRequest) return false;
  if (requestStatus === 'awaiting_review' || options.isAwaitingReview) return true;
  if (requestStatus === 'posted' || requestStatus === 'searching') return true;
  return false;
}

export function partitionRequestResponsesForRequester<T extends RequestResponseListRow>(
  responses: T[],
  requestStatus: RequestStatus,
  options: { isAwaitingReview: boolean; isExpiredRequest: boolean },
) {
  const accepted = responses.find((row) => row.status === 'accepted') ?? null;
  const pendingAlternatives = responses.filter((row) => row.status === 'pending');
  const withdrawn = responses.filter((row) => row.status === 'withdrawn');
  const declined = responses.filter((row) => row.status === 'declined');
  const canAccept = requesterCanAcceptResponses(requestStatus, options);
  const hasActiveEngagement = requestStatus === 'accepted' || requestStatus === 'in_progress';

  return {
    accepted,
    pendingAlternatives,
    withdrawn,
    declined,
    canAccept,
    hasActiveEngagement,
    selectablePending: canAccept ? pendingAlternatives : [],
    referencePending: hasActiveEngagement ? pendingAlternatives : [],
  };
}
