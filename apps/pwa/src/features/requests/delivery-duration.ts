export type DeliveryDurationUnit = 'minutes' | 'hours' | 'days' | 'weeks';

export const DELIVERY_DURATION_UNITS: DeliveryDurationUnit[] = ['minutes', 'hours', 'days', 'weeks'];

export const MAX_DELIVERY_SECONDS = 30 * 86_400;
export const MIN_DELIVERY_SECONDS = 60;

const UNIT_SECONDS: Record<DeliveryDurationUnit, number> = {
  minutes: 60,
  hours: 3_600,
  days: 86_400,
  weeks: 604_800,
};

export function deliveryDurationToSeconds(
  value: number,
  unit: DeliveryDurationUnit,
): number | null {
  if (!Number.isInteger(value) || value < 1) return null;
  return value * UNIT_SECONDS[unit];
}

export function maxValueForDeliveryUnit(unit: DeliveryDurationUnit): number {
  return Math.floor(MAX_DELIVERY_SECONDS / UNIT_SECONDS[unit]);
}

export function validateProposedDeliveryDuration(
  value: number,
  unit: DeliveryDurationUnit,
): string | null {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    return 'Enter a whole number greater than zero.';
  }
  const seconds = deliveryDurationToSeconds(value, unit);
  if (seconds === null) return 'Enter a valid duration.';
  if (seconds < MIN_DELIVERY_SECONDS) {
    return 'Delivery must be at least 1 minute.';
  }
  if (seconds > MAX_DELIVERY_SECONDS) {
    return 'Delivery cannot be more than 30 days.';
  }
  return null;
}

function unitLabel(unit: DeliveryDurationUnit, count: number): string {
  const base = unit === 'minutes' ? 'minute' : unit === 'hours' ? 'hour' : unit === 'days' ? 'day' : 'week';
  return count === 1 ? base : `${base}s`;
}

export function formatInDurationPreview(value: number, unit: DeliveryDurationUnit): string {
  return `In ${value} ${unitLabel(unit, value)}`;
}

export function formatDeliveryInDuration(value: number, unit: DeliveryDurationUnit): string {
  return `Delivery in ${value} ${unitLabel(unit, value)}.`;
}

export type ProposedDeliveryDisplay =
  | { kind: 'duration'; value: number; unit: DeliveryDurationUnit }
  | { kind: 'calendar'; iso: string; timezone: string | null };

export function proposedDeliveryLabelFromRow(input: {
  proposed_delivery_duration_value: number | null;
  proposed_delivery_duration_unit: DeliveryDurationUnit | null;
  proposed_delivery_at: string | null;
  proposed_delivery_timezone: string | null;
  formatCalendar: (iso: string, timezone: string | null) => string | null;
}): string | null {
  if (
    input.proposed_delivery_duration_value != null &&
    input.proposed_delivery_duration_unit
  ) {
    return formatInDurationPreview(
      input.proposed_delivery_duration_value,
      input.proposed_delivery_duration_unit,
    );
  }
  if (input.proposed_delivery_at) {
    return input.formatCalendar(input.proposed_delivery_at, input.proposed_delivery_timezone);
  }
  return null;
}

export function formatDeliveryDeadlineRelative(
  deadlineIso: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!deadlineIso) return null;
  const deadline = new Date(deadlineIso);
  if (Number.isNaN(deadline.getTime())) return null;
  const diffMs = deadline.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const minutes = Math.floor(abs / 60_000);
  const hours = Math.floor(abs / 3_600_000);
  const days = Math.floor(abs / 86_400_000);
  const weeks = Math.floor(abs / 604_800_000);

  const overdue = diffMs < 0;
  const prefix = overdue ? 'Overdue by ' : 'Due in ';

  if (weeks >= 1) return `${prefix}${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  if (days >= 1) return `${prefix}${days} ${days === 1 ? 'day' : 'days'}`;
  if (hours >= 1) return `${prefix}${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const mins = Math.max(1, minutes);
  return `${prefix}${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
}

export function formatDeliveryRemaining(
  deadlineIso: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!deadlineIso) return null;
  const deadline = new Date(deadlineIso);
  if (Number.isNaN(deadline.getTime())) return null;
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs <= 0) return formatDeliveryDeadlineRelative(deadlineIso, now);

  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  const weeks = Math.floor(diffMs / 604_800_000);

  if (weeks >= 1) return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} remaining`;
  if (days >= 1) return `${days} ${days === 1 ? 'day' : 'days'} remaining`;
  if (hours >= 1) return `${hours} ${hours === 1 ? 'hour' : 'hours'} remaining`;
  const mins = Math.max(1, minutes);
  return `${mins} ${mins === 1 ? 'minute' : 'minutes'} remaining`;
}

export const DEFAULT_DELIVERY_DURATION = { value: 3, unit: 'days' as const satisfies DeliveryDurationUnit };

export function initialProposedDeliveryDuration(input: {
  value: number | null | undefined;
  unit: DeliveryDurationUnit | null | undefined;
}): { value: number; unit: DeliveryDurationUnit } {
  if (input.value != null && input.unit) {
    return { value: input.value, unit: input.unit };
  }
  return { ...DEFAULT_DELIVERY_DURATION };
}