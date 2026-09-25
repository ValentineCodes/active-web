import type { PaymentStatus, RequestStatus } from '@/features/domain/model';

/**
 * Request/service lifecycle (stored on public.requests.status).
 * Payment state is independent — see PAYMENT_TRANSITIONS.
 */
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  draft: 'Draft',
  searching: 'Searching',
  accepted: 'Handshake',
  in_progress: 'In progress',
  completion_pending: 'Completion pending',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  disputed: 'Disputed',
  no_show: 'No-show',
};

/** Allowed request status moves performed only by security-definer RPCs. */
export const REQUEST_STATUS_TRANSITIONS: Partial<Record<RequestStatus, RequestStatus[]>> = {
  searching: ['accepted', 'cancelled', 'expired'],
  accepted: ['in_progress', 'completion_pending', 'cancelled', 'disputed', 'no_show'],
  in_progress: ['completion_pending', 'cancelled', 'disputed', 'no_show'],
  /** Requester cancel is blocked; provider `cancel_service` may still cancel server-side. */
  completion_pending: ['completed', 'disputed'],
  disputed: ['accepted', 'in_progress', 'no_show'],
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  not_required: 'No payment',
  available: 'Available',
  locked: 'Locked',
  pending: 'Pending release',
  released: 'Released',
  refunded: 'Refunded',
  disputed: 'Disputed',
};

/** Idempotent transitions recorded in public.payment_transitions. */
export const PAYMENT_TRANSITIONS: Partial<Record<PaymentStatus, PaymentStatus[]>> = {
  not_required: ['not_required'],
  available: ['locked', 'not_required'],
  locked: ['pending', 'refunded', 'disputed'],
  pending: ['released', 'refunded', 'disputed'],
  released: ['disputed'],
  refunded: ['disputed'],
  disputed: ['released', 'refunded'],
};

export function canTransitionRequest(from: RequestStatus, to: RequestStatus): boolean {
  return REQUEST_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}
