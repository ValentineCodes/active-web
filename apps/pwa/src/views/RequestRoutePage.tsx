'use client';

import { Navigate } from 'react-router-dom';

import { isHelperEngagementView } from '@/features/requests/activity-list';
import { useMyResponses } from '@/features/requests/responses-api';
import { useMyRequests } from '@/features/requests/requester-api';
import { useSearchParams } from '@/lib/navigation';
import { useRouteParam } from '@/lib/route-param';
import { LoadingState } from '@/components/ui/StateView';
import { RequestDetailPage } from '@/views/RequestDetailPage';
import { RespondPage } from '@/views/RespondPage';

/** Owner detail vs helper browse — same URL as mobile (`/request/:id`). */
export function RequestRoutePage() {
  const id = useRouteParam('id');
  const search = useSearchParams();
  const fromFeedAsMine = search.get('mine') === '1';
  const myRequests = useMyRequests();
  const myResponses = useMyResponses();
  const isMineFromList = myRequests.data?.some((row) => row.request_id === id) ?? false;
  const isMine = isMineFromList || (fromFeedAsMine && !myRequests.isError);

  const helperEngagement = myResponses.data?.find(
    (row) =>
      row.request_id === id &&
      isHelperEngagementView({
        responseStatus: row.response_status,
        requestStatus: row.request_status,
      }),
  );

  if (myRequests.isPending || myResponses.isPending) {
    return <LoadingState label="Loading request…" />;
  }

  if (helperEngagement) {
    return <Navigate to={`/engagement/${id}`} replace />;
  }

  if (isMine) return <RequestDetailPage />;
  return <RespondPage />;
}
