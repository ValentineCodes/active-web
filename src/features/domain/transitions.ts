import type { PaymentStatus, RequestStatus } from '@/features/domain/model';
import { requestStatusLifecycleTitle } from '@/features/domain/lifecycle';

/**
 * Stored request_status values (Postgres enum). UI lifecycle copy lives in lifecycle.ts.
 */
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  draft: 'Draft',
  posted: 'Posted',
  searching: 'Posted',
  accepted: 'Selected',
  in_progress: 'In progress',
  completion_pending: 'Confirm',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  disputed: 'Issue open',
  no_show: 'No-show',
};

/** Allowed request status moves performed only by security-definer RPCs. */
export const REQUEST_STATUS_TRANSITIONS: Partial<Record<RequestStatus, RequestStatus[]>> = {
  posted: ['accepted', 'cancelled', 'expired'],
  searching: ['accepted', 'cancelled', 'expired'],
  accepted: ['in_progress', 'completion_pending', 'cancelled', 'disputed', 'no_show'],
  in_progress: ['completion_pending', 'cancelled', 'disputed', 'no_show'],
  completion_pending: ['completed', 'disputed'],
  disputed: ['accepted', 'in_progress', 'no_show'],
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  not_required: 'No payment',
  available: 'Available',
  locked: 'Held',
  pending: 'Held until paid',
  released: 'Paid',
  refunded: 'Refunded',
  disputed: 'On hold',
};

export const PAYMENT_TRANSITIONS: Partial<Record<PaymentStatus, PaymentStatus[]>> = {
  not_required: ['not_required'],
  available: ['locked', 'not_required'],
  locked: ['pending', 'refunded', 'disputed'],
  pending: ['released', 'refunded', 'disputed'],
  released: ['disputed'],
  refunded: ['disputed'],
  disputed: ['released', 'refunded', 'pending', 'locked'],
};

export function canTransitionRequest(from: RequestStatus, to: RequestStatus): boolean {
  return REQUEST_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function normalizeRequestStatus(status: RequestStatus): RequestStatus {
  return status === 'searching' ? 'posted' : status;
}

/** Human title for a stored status without pending-response context. */
export function storedRequestStatusTitle(status: RequestStatus): string {
  return requestStatusLifecycleTitle(status);
}
