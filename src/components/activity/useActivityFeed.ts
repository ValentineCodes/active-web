import { useAttendance } from '@/features/attendance/api';
import { useMyResponses } from '@/features/requests/responses-api';
import { useMyRequests } from '@/features/requests/requester-api';

export function useActivityFeed() {
  const attendance = useAttendance();
  const requests = useMyRequests();
  const responses = useMyResponses();

  const attendingRequestId = attendance.data?.attending_request_id ?? null;

  const attendingRequestRow = requests.data?.find((row) => row.request_id === attendingRequestId);
  const attendingResponseRow = responses.data?.find((row) => row.request_id === attendingRequestId);
  const attendingTitle = attendingRequestRow?.title ?? attendingResponseRow?.title ?? 'Request';

  const myRequests = [...(requests.data ?? [])].sort((a, b) => {
    const aTime = new Date(a.updated_at ?? a.created_at).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at).getTime();
    return bTime - aTime;
  });

  const myResponses = [...(responses.data ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const isLoading = requests.isPending || responses.isPending || attendance.isPending;
  const isError = requests.isError || responses.isError;
  const isRefetching = requests.isRefetching || responses.isRefetching || attendance.isRefetching;

  const refetchAll = () => {
    void requests.refetch();
    void responses.refetch();
    void attendance.refetch();
  };

  return {
    attendingRequestId,
    attendingRequestRow,
    attendingResponseRow,
    attendingTitle,
    myRequests,
    myResponses,
    isLoading,
    isError,
    error: requests.error ?? responses.error,
    isRefetching,
    refetchAll,
  };
}
