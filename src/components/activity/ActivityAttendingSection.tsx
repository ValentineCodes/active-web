import { router } from 'expo-router';

import { ActivityAttendingCard } from '@/components/ActivityTabCards';
import {
  myRequestActivitySubtitle,
  myResponseActivitySubtitle,
} from '@/features/requests/activity-list';

import { useActivityFeed } from './useActivityFeed';

export function ActivityAttendingSection() {
  const { attendingRequestId, attendingRequestRow, attendingResponseRow, attendingTitle } =
    useActivityFeed();

  if (!attendingRequestId) return null;

  const attendingSubtitle = attendingRequestRow
    ? myRequestActivitySubtitle({
        status: attendingRequestRow.status,
        expires_at: attendingRequestRow.expires_at,
        pending_response_count: attendingRequestRow.pending_response_count,
        offered_amount: attendingRequestRow.offered_amount,
        agreed_provider_amount: attendingRequestRow.agreed_provider_amount,
        currency: attendingRequestRow.currency,
        created_at: attendingRequestRow.created_at,
        completed_at: attendingRequestRow.completed_at,
        cancelled_at: attendingRequestRow.cancelled_at,
      })
    : attendingResponseRow
      ? myResponseActivitySubtitle({
          response_status: attendingResponseRow.response_status,
          request_status: attendingResponseRow.request_status,
          offered_amount: attendingResponseRow.offered_amount,
          quoted_amount: attendingResponseRow.quoted_amount,
          currency: attendingResponseRow.currency,
          created_at: attendingResponseRow.created_at,
        })
      : "You're currently helping with this request.";

  return (
    <ActivityAttendingCard
      title={attendingTitle}
      subtitle={attendingSubtitle}
      onPress={() => router.push(`/engagement/${attendingRequestId}`)}
    />
  );
}
