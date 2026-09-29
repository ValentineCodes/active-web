import type { RequestStatus } from '@/features/domain/model';
import { normalizeRequestStatus } from '@/features/domain/transitions';
import { isExpiredRequestView } from '@/features/requests/reuse';

/**
 * Product lifecycle stages. `responses` and `posted` both store `posted` in the database.
 * `selected` stores `accepted`.
 */
export type RequestLifecycleStage =
  | 'draft'
  | 'posted'
  | 'responses'
  | 'selected'
  | 'in_progress'
  | 'completion_pending'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'disputed'
  | 'no_show';

type LifecycleCopy = { title: string; hint: string };

const REQUESTER_COPY: Record<Exclude<RequestLifecycleStage, 'draft' | 'no_show'>, LifecycleCopy> = {
  posted: { title: 'Posted', hint: 'Waiting for someone to respond.' },
  responses: { title: 'Responses', hint: 'People have offered to help.' },
  selected: { title: 'Selected', hint: "You've chosen someone." },
  in_progress: { title: 'In progress', hint: "They're helping you now." },
  completion_pending: { title: 'Confirm', hint: 'Confirm when the work is done.' },
  completed: { title: 'Completed', hint: 'Done.' },
  cancelled: { title: 'Cancelled', hint: 'This request was cancelled.' },
  expired: { title: 'Expired', hint: 'This request expired before anyone was chosen.' },
  disputed: { title: 'Issue open', hint: 'There is an open issue on this request.' },
};

const HELPER_COPY: Partial<Record<RequestLifecycleStage, LifecycleCopy>> = {
  selected: { title: 'Selected', hint: "You've been chosen." },
  in_progress: { title: 'In progress', hint: "You're helping now." },
  completion_pending: { title: 'Confirm', hint: 'Waiting for them to confirm.' },
  completed: { title: 'Completed', hint: 'Done.' },
};

export function resolveRequestLifecycleStage(input: {
  status: RequestStatus;
  pendingResponseCount: number;
  expiresAt?: string | null;
}): RequestLifecycleStage {
  if (isExpiredRequestView(input.status, input.expiresAt ?? null)) {
    return 'expired';
  }

  const status = normalizeRequestStatus(input.status);

  switch (status) {
    case 'draft':
      return 'draft';
    case 'posted':
    case 'searching':
      return input.pendingResponseCount > 0 ? 'responses' : 'posted';
    case 'accepted':
      return 'selected';
    case 'in_progress':
      return 'in_progress';
    case 'completion_pending':
      return 'completion_pending';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'disputed':
      return 'disputed';
    case 'no_show':
      return 'no_show';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function requestLifecycleCopy(
  stage: RequestLifecycleStage,
  options?: { viewerIsRequester?: boolean },
): LifecycleCopy {
  if (stage === 'draft') {
    return { title: 'Draft', hint: 'Finish and post when you are ready.' };
  }

  if (stage === 'no_show') {
    return { title: 'No-show', hint: 'This request was marked as a no-show.' };
  }

  const viewerIsRequester = options?.viewerIsRequester ?? true;
  if (!viewerIsRequester && HELPER_COPY[stage]) {
    return HELPER_COPY[stage]!;
  }

  return REQUESTER_COPY[stage];
}

export type LifecycleBadgeTone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning';

export function requestLifecycleBadge(
  stage: RequestLifecycleStage,
  options?: { viewerIsRequester?: boolean },
): { label: string; hint: string; tone: LifecycleBadgeTone } {
  const { title, hint } = requestLifecycleCopy(stage, options);

  const tone: LifecycleBadgeTone = (() => {
    switch (stage) {
      case 'posted':
        return 'warning';
      case 'responses':
        return 'brand';
      case 'selected':
      case 'in_progress':
        return 'active';
      case 'completion_pending':
        return 'warning';
      case 'disputed':
      case 'cancelled':
      case 'no_show':
        return 'danger';
      case 'completed':
      case 'expired':
        return 'neutral';
      default:
        return 'neutral';
    }
  })();

  return { label: title, hint, tone };
}

/** Stored enum → primary lifecycle title (ignores responses sub-stage). */
export function requestStatusLifecycleTitle(status: RequestStatus): string {
  const stage = resolveRequestLifecycleStage({
    status,
    pendingResponseCount: 0,
  });
  return requestLifecycleCopy(stage).title;
}
