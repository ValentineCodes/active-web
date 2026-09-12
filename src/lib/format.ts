import { format, formatDistanceToNowStrict, isThisYear, isToday, isTomorrow } from 'date-fns';

/**
 * Distances arrive already rounded by the database, so this only chooses units. It
 * deliberately reads as an approximation, because before acceptance that is all it is.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m away`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km away`;
}

export function formatRadius(meters: number): string {
  return `${meters / 1000} km`;
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** `null` means the requester needs it as soon as possible. */
export function formatWhen(scheduledFor: string | null): string {
  if (!scheduledFor) return 'As soon as possible';

  const date = new Date(scheduledFor);
  if (isToday(date)) return `Today at ${format(date, 'HH:mm')}`;
  if (isTomorrow(date)) return `Tomorrow at ${format(date, 'HH:mm')}`;
  if (isThisYear(date)) return format(date, "EEE d MMM 'at' HH:mm");
  return format(date, "d MMM yyyy 'at' HH:mm");
}

export function formatAgo(iso: string): string {
  return `${formatDistanceToNowStrict(new Date(iso))} ago`;
}

export function formatRating(average: number | null, count: number): string {
  if (count === 0 || average === null) return 'No ratings yet';
  return `${average.toFixed(1)} (${count})`;
}
