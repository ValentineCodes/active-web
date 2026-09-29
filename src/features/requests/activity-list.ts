import { format, isThisYear, isToday, isTomorrow } from 'date-fns';

import { requestLifecycleCopy, resolveRequestLifecycleStage } from '@/features/domain/lifecycle';
import type { Database } from '@/lib/supabase/database.types';
import { formatMoney } from '@/lib/format';

import { isExpiredRequestView } from '@/features/requests/reuse';

type RequestStatus = Database['public']['Enums']['request_status'];
type ResponseStatus = Database['public']['Enums']['response_status'];

export function activityDayLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;

  const date = new Date(iso);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isThisYear(date)) return format(date, 'd MMM');
  return format(date, 'd MMM yyyy');
}

export function activityAmountLabel(
  offeredAmount: number | null,
  currency: string,
  agreedAmount?: number | null,
): string | null {
  const amount = agreedAmount != null && agreedAmount > 0 ? agreedAmount : offeredAmount;

  if (amount == null || amount <= 0) return null;
  return formatMoney(amount, currency);
}

function joinActivityParts(parts: (string | null | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part && part.length > 0)).join(' · ');
}

export function myRequestActivitySubtitle(request: {
  status: RequestStatus;
  expires_at: string | null;
  pending_response_count: number;
  offered_amount: number | null;
  agreed_provider_amount?: number | null;
  currency: string;
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
}): string {
  const stage = resolveRequestLifecycleStage({
    status: request.status,
    pendingResponseCount: request.pending_response_count,
    expiresAt: request.expires_at,
  });

  const statusTitle = requestLifecycleCopy(stage, { viewerIsRequester: true }).title;

  const milestone =
    stage === 'completed'
      ? activityDayLabel(request.completed_at)
      : stage === 'cancelled'
        ? activityDayLabel(request.cancelled_at)
        : stage === 'expired'
          ? activityDayLabel(request.expires_at)
          : activityDayLabel(request.created_at);

  return joinActivityParts([
    statusTitle,
    activityAmountLabel(request.offered_amount, request.currency, request.agreed_provider_amount),
    milestone,
  ]);
}

export function myResponseActivitySubtitle(response: {
  response_status: ResponseStatus;
  request_status: RequestStatus;
  offered_amount: number | null;
  quoted_amount: number | null;
  currency: string;
  created_at: string;
}): string {
  const requestStatus = isExpiredRequestView(response.request_status, null)
    ? 'expired'
    : response.request_status;

  let statusLine: string;

  if (response.response_status === 'accepted') {
    const stage = resolveRequestLifecycleStage({
      status: requestStatus,
      pendingResponseCount: 0,
    });

    if (stage === 'in_progress' || stage === 'completion_pending') {
      const helperStage = requestLifecycleCopy(stage, { viewerIsRequester: false }).title;
      statusLine = `Selected · ${helperStage}`;
    } else if (stage === 'completed') {
      statusLine = 'Completed';
    } else if (stage === 'disputed' || stage === 'no_show' || stage === 'cancelled') {
      statusLine = requestLifecycleCopy(stage, { viewerIsRequester: false }).title;
    } else {
      statusLine = 'Selected';
    }
  } else if (response.response_status === 'pending') {
    statusLine =
      requestStatus === 'posted' || requestStatus === 'searching' ? 'Responded' : 'Closed';
  } else if (response.response_status === 'declined') {
    statusLine = 'Not chosen';
  } else if (response.response_status === 'withdrawn') {
    statusLine = 'Withdrawn';
  } else {
    statusLine = 'Closed';
  }

  const amount = activityAmountLabel(
    response.offered_amount,
    response.currency,
    response.quoted_amount,
  );

  return joinActivityParts([statusLine, amount, activityDayLabel(response.created_at)]);
}

export function requestNavigationPath(input: {
  role: 'requester' | 'helper';
  requestId: string;
  requestStatus: RequestStatus;
  responseStatus?: ResponseStatus;
}): `/request/${string}` | `/respond/${string}` | `/engagement/${string}` {
  const status = input.requestStatus;

  if (input.role === 'requester') {
    if (['accepted', 'in_progress', 'completion_pending', 'disputed', 'no_show'].includes(status)) {
      return `/engagement/${input.requestId}`;
    }
    return `/request/${input.requestId}`;
  }

  if (
    input.responseStatus === 'accepted' &&
    ['accepted', 'in_progress', 'completion_pending', 'completed', 'disputed', 'no_show'].includes(
      status,
    )
  ) {
    return `/engagement/${input.requestId}`;
  }

  return `/respond/${input.requestId}`;
}
