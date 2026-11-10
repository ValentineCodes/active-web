import { format, isThisYear, isToday, isTomorrow } from 'date-fns';

import { requestLifecycleCopy, resolveRequestLifecycleStage } from '@/features/domain/lifecycle';
import type { NotificationType } from '@/features/notifications/types';
import type { Database } from '@/lib/supabase/database.types';
import { formatAgo, formatMoney } from '@/lib/format';

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

type ActivityBadgeTone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';

export function myRequestResponseCountLine(pendingResponseCount: number): string {
  if (pendingResponseCount <= 0) return 'No responses yet';
  if (pendingResponseCount === 1) return '1 response';
  return `${pendingResponseCount} responses`;
}

export function myRequestActivityDetailLine(request: {
  status: RequestStatus;
  expires_at: string | null;
  pending_response_count: number;
  created_at: string;
  updated_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}): string {
  const stage = resolveRequestLifecycleStage({
    status: request.status,
    pendingResponseCount: request.pending_response_count,
    expiresAt: request.expires_at,
  });

  if (stage === 'posted' || stage === 'responses') {
    return myRequestResponseCountLine(request.pending_response_count);
  }

  const iso =
    (stage === 'completed'
      ? request.completed_at
      : stage === 'cancelled'
        ? request.cancelled_at
        : stage === 'expired' || stage === 'awaiting_review'
          ? request.expires_at
          : request.updated_at) ?? request.created_at;

  return formatAgo(iso);
}

/** Activity tab card badge for requests you posted (matches activity mock labels). */
export function myRequestActivityBadge(request: {
  status: RequestStatus;
  expires_at: string | null;
  pending_response_count: number;
}): { label: string; tone: ActivityBadgeTone } {
  const stage = resolveRequestLifecycleStage({
    status: request.status,
    pendingResponseCount: request.pending_response_count,
    expiresAt: request.expires_at,
  });

  switch (stage) {
    case 'posted':
    case 'responses':
      return { label: 'Open', tone: 'warning' };
    case 'selected':
      return { label: 'Active', tone: 'info' };
    case 'in_progress':
    case 'completion_pending':
      return { label: 'In Progress', tone: 'info' };
    case 'completed':
      return { label: 'Completed', tone: 'brand' };
    case 'disputed':
      return { label: 'Disputed', tone: 'danger' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' };
    case 'awaiting_review':
      return { label: 'Awaiting review', tone: 'warning' };
    case 'expired':
      return { label: 'Expired', tone: 'neutral' };
    case 'no_show':
      return { label: 'No-show', tone: 'danger' };
    default:
      return {
        label: requestLifecycleCopy(stage, { viewerIsRequester: true }).title,
        tone: 'neutral',
      };
  }
}

/** Activity tab card badge for your responses (matches activity mock labels). */
export function myResponseActivityBadge(response: {
  response_status: ResponseStatus;
  request_status: RequestStatus;
}): { label: string; tone: ActivityBadgeTone } {
  const requestStatus = response.request_status;

  if (response.response_status === 'pending') {
    if (requestStatus === 'posted' || requestStatus === 'searching') {
      return { label: 'Waiting', tone: 'warning' };
    }
    if (requestStatus === 'awaiting_review') {
      return { label: 'Closed', tone: 'neutral' };
    }
    return { label: 'Closed', tone: 'neutral' };
  }

  if (response.response_status === 'accepted') {
    const stage = resolveRequestLifecycleStage({
      status: requestStatus,
      pendingResponseCount: 0,
    });

    if (
      stage === 'selected' ||
      stage === 'in_progress' ||
      stage === 'completion_pending' ||
      requestStatus === 'accepted'
    ) {
      return { label: 'Active', tone: 'info' };
    }
    if (stage === 'completed') {
      return { label: 'Completed', tone: 'brand' };
    }
    if (stage === 'disputed' || stage === 'no_show') {
      return { label: 'Disputed', tone: 'danger' };
    }
    if (stage === 'cancelled' || stage === 'expired') {
      return { label: 'Closed', tone: 'neutral' };
    }
    return { label: 'Active', tone: 'info' };
  }

  if (response.response_status === 'declined') {
    return { label: 'Not chosen', tone: 'neutral' };
  }
  if (response.response_status === 'withdrawn') {
    return { label: 'Withdrawn', tone: 'neutral' };
  }

  return { label: 'Closed', tone: 'neutral' };
}

export function myResponseActivityMetaLine(response: {
  requester_display_name: string | null;
  created_at: string;
}): string {
  const name = response.requester_display_name?.trim() || 'Requester';
  return `${name} · ${formatAgo(response.created_at)}`;
}

export function myResponseActivityOfferLine(
  offeredAmount: number | null,
  currency: string,
  quotedAmount: number | null,
): string | null {
  const amount = activityAmountLabel(offeredAmount, currency, quotedAmount);
  if (!amount) return null;
  return `You offered ${amount}`;
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
        : stage === 'expired' || stage === 'awaiting_review'
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
  const requestStatus = response.request_status;

  let statusLine: string;

  if (response.response_status === 'accepted') {
    const stage = resolveRequestLifecycleStage({
      status: requestStatus,
      pendingResponseCount: 0,
    });

    if (stage === 'in_progress' || stage === 'completion_pending') {
      const helperStage = requestLifecycleCopy(stage, { viewerIsRequester: false }).title;
      statusLine = `Active · ${helperStage}`;
    } else if (stage === 'completed') {
      statusLine = 'Completed';
    } else if (stage === 'disputed' || stage === 'no_show' || stage === 'cancelled') {
      statusLine = requestLifecycleCopy(stage, { viewerIsRequester: false }).title;
    } else {
      statusLine = 'Active';
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
    if (['completion_pending', 'disputed', 'no_show'].includes(status)) {
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

const REQUEST_STATUSES = new Set<RequestStatus>([
  'posted',
  'searching',
  'awaiting_review',
  'accepted',
  'in_progress',
  'completion_pending',
  'completed',
  'cancelled',
  'expired',
  'disputed',
  'no_show',
]);

const RESPONSE_STATUSES = new Set<ResponseStatus>(['pending', 'accepted', 'declined', 'withdrawn']);

function metadataRequestStatus(metadata: Record<string, unknown> | null): RequestStatus | null {
  const raw = metadata?.request_status;
  if (typeof raw !== 'string' || !REQUEST_STATUSES.has(raw as RequestStatus)) return null;
  return raw as RequestStatus;
}

function metadataResponseStatus(metadata: Record<string, unknown> | null): ResponseStatus | null {
  const raw = metadata?.response_status;
  if (typeof raw !== 'string' || !RESPONSE_STATUSES.has(raw as ResponseStatus)) return null;
  return raw as ResponseStatus;
}

function metadataRole(metadata: Record<string, unknown> | null): 'requester' | 'helper' {
  return metadata?.role === 'helper' ? 'helper' : 'requester';
}

/** Inbox / push target for a notification tied to a request (matches Activity tab routing). */
export function notificationNavigationPath(input: {
  requestId: string;
  type: NotificationType;
  metadata: Record<string, unknown> | null;
}): `/request/${string}` | `/respond/${string}` | `/engagement/${string}` {
  if (
    input.metadata?.link === 'respond' ||
    input.type === 'response_not_selected' ||
    input.type === 'matching_request'
  ) {
    return `/respond/${input.requestId}`;
  }

  const requestStatus = metadataRequestStatus(input.metadata);
  if (requestStatus) {
    return requestNavigationPath({
      role: metadataRole(input.metadata),
      requestId: input.requestId,
      requestStatus,
      responseStatus: metadataResponseStatus(input.metadata) ?? undefined,
    });
  }

  if (
    input.type === 'response_received' ||
    input.type === 'new_responses' ||
    input.type === 'request_expiring' ||
    input.type === 'request_awaiting_review' ||
    input.type === 'request_expired' ||
    input.type === 'payment_secured' ||
    input.type === 'rate_experience' ||
    input.type === 'payment_released' ||
    input.type === 'funds_released_after_resolution' ||
    input.type === 'request_cancelled' ||
    input.type === 'cancellation_confirmed' ||
    input.type === 'funds_returned'
  ) {
    return `/request/${input.requestId}`;
  }

  return `/engagement/${input.requestId}`;
}
