import { format } from 'date-fns';

export const DEFAULT_PROPOSED_DELIVERY_TIMEZONE = 'Africa/Lagos';

const MIN_LEAD_MS = 60_000;

export type DeliveryDismissalKind = 'failure_to_start' | 'missed_delivery';

export function validateProposedDeliveryAt(candidate: Date, now: Date = new Date()): string | null {
  if (!(candidate instanceof Date) || Number.isNaN(candidate.getTime())) {
    return 'Choose a valid date and time.';
  }
  if (candidate.getTime() <= now.getTime() + MIN_LEAD_MS) {
    return 'Choose a delivery time in the future.';
  }
  return null;
}

export function formatDeliveryInstantLabel(
  iso: string | null | undefined,
  timezone: string | null | undefined,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const when = format(date, "EEEE, d MMM 'at' h:mm a");
  const tz = timezone?.trim();
  return tz ? `${when} (${tz})` : when;
}

export function formatCountdownDuration(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function startWindowRemainingMs(
  startByAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!startByAt) return null;
  const end = new Date(startByAt);
  if (Number.isNaN(end.getTime())) return null;
  return end.getTime() - now.getTime();
}

export function isStartWindowOpen(
  requestStatus: string,
  startedAt: string | null | undefined,
  startByAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (requestStatus !== 'accepted' || startedAt) return false;
  const remaining = startWindowRemainingMs(startByAt, now);
  return remaining !== null && remaining > 0;
}

export function canDismissFailureToStart(input: {
  viewerIsRequester: boolean;
  requestStatus: string;
  startedAt: string | null | undefined;
  startByAt: string | null | undefined;
  now?: Date;
}): boolean {
  if (!input.viewerIsRequester) return false;
  if (input.requestStatus !== 'accepted' || input.startedAt) return false;
  const remaining = startWindowRemainingMs(input.startByAt, input.now);
  return remaining !== null && remaining <= 0;
}

export function canDismissMissedDeliveryUi(input: {
  viewerIsRequester: boolean;
  requestStatus: string;
  startedAt: string | null | undefined;
  deliveryDeadlineAt: string | null | undefined;
  paymentStatus: string | null | undefined;
  now?: Date;
}): boolean {
  if (!input.viewerIsRequester) return false;
  if (input.requestStatus !== 'in_progress' || !input.startedAt) return false;
  if (!input.deliveryDeadlineAt) return false;
  if (input.paymentStatus === 'disputed') return false;
  const deadline = new Date(input.deliveryDeadlineAt);
  if (Number.isNaN(deadline.getTime())) return false;
  return deadline.getTime() <= (input.now ?? new Date()).getTime();
}

export function dismissalConfirmationCopy(kind: DeliveryDismissalKind): {
  title: string;
  message: string;
  financialNote: string;
} {
  if (kind === 'failure_to_start') {
    return {
      title: 'End engagement — did not start?',
      message:
        'Use this only if they never pressed Start within 24 hours of you accepting. This is not the same as missing a delivery deadline.',
      financialNote:
        'If you continue, the full locked payment returns to your wallet. No service fee is charged on this refund.',
    };
  }
  return {
    title: 'End engagement — missed delivery?',
    message:
      'Use this only if they started work but did not meet the binding delivery deadline. This is different from failing to press Start.',
    financialNote:
      'Remaining locked payment returns to your wallet (milestone jobs keep amounts already approved and paid). No service fee on refunded amounts. The server confirms eligibility.',
  };
}

export function helperShowStartButton(input: {
  viewerIsRequester: boolean;
  requestStatus: string;
  startedAt: string | null | undefined;
  startByAt: string | null | undefined;
  now?: Date;
}): boolean {
  if (input.viewerIsRequester) return false;
  return isStartWindowOpen(input.requestStatus, input.startedAt, input.startByAt, input.now);
}

export function proposedDeliveryExplainerForHelper(_hasStarted: boolean): string {
  return '';
}

export function proposedDeliveryExplainerForRequester(_hasStarted: boolean): string {
  return '';
}