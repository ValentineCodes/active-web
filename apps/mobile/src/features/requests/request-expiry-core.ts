import { format } from 'date-fns';

import {
  DEFAULT_PROPOSED_DELIVERY_TIMEZONE,
  validateProposedDeliveryAt,
} from './engagement-lifecycle.ts';

export const REQUEST_EXPIRY_TIMEZONE = DEFAULT_PROPOSED_DELIVERY_TIMEZONE;

export type RequestExpiryMode = 'today' | 'future';

export function defaultFutureExpiryDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 0, 0);
}

export function expirySummaryLabel(mode: RequestExpiryMode, when: Date): string {
  if (mode === 'today') return 'Today at 11:59 PM';
  return format(when, "EEEE, d MMM 'at' h:mm a");
}

export function localDateIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localTimeIso(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function validateRequestExpiryChoice(
  mode: RequestExpiryMode,
  futureAt: Date,
  now: Date = new Date(),
): string | null {
  if (mode === 'today') return null;
  return validateProposedDeliveryAt(futureAt, now);
}