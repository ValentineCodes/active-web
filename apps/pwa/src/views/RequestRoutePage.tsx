'use client';

import { useSearchParams } from 'next/navigation';

import { useMyRequests } from '@/features/requests/requester-api';
import { useRouteParam } from '@/lib/route-param';
import { RequestDetailPage } from '@/views/RequestDetailPage';
import { RespondPage } from '@/views/RespondPage';

/** Owner detail vs helper browse — same URL as mobile (`/request/:id`). */
export function RequestRoutePage() {
  const id = useRouteParam('id');
  const search = useSearchParams();
  const fromFeedAsMine = search.get('mine') === '1';
  const myRequests = useMyRequests();
  const isMineFromList = myRequests.data?.some((row) => row.request_id === id) ?? false;
  const isMine = isMineFromList || (fromFeedAsMine && !myRequests.isError);

  if (isMine) return <RequestDetailPage />;
  return <RespondPage />;
}
