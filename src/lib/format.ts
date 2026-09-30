import { format, formatDistanceToNowStrict, isThisYear, isToday, isTomorrow } from 'date-fns';

/**
 * Bucketed metres from the server → vague travel-time wording (not a route estimate).
 */
export function formatProximity(meters: number): string {
  if (meters <= 2500) return 'Nearby';
  if (meters <= 8000) return 'A few minutes away';
  if (meters <= 20_000) return 'About 10 minutes away';
  return 'About 30 minutes away';
}

/** Home feed — travel-time wording from the mock. */
export function formatProximityHome(meters: number): string {
  if (meters <= 2500) return 'Nearby';
  if (meters <= 5000) return '5 mins away';
  if (meters <= 8000) return 'A few minutes away';
  if (meters <= 20_000) return 'About 10 mins away';
  return 'About 30 mins away';
}

/** Home feed — when line without a middle dot separator. */
export function formatWhenHome(scheduledFor: string | null): string {
  if (!scheduledFor) return 'Today';

  const date = new Date(scheduledFor);
  const time = format(date, 'h:mm a');
  if (isToday(date)) return `Today, ${time}`;
  if (isTomorrow(date)) return `Tomorrow, ${time}`;
  if (isThisYear(date)) return `${format(date, 'EEEE')}, ${time}`;
  return `${format(date, 'd MMM yyyy')}, ${time}`;
}

export function formatGreeting(displayName: string | null): string {
  const hour = new Date().getHours();
  const period = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? `${period}, ${first}` : period;
}

/** Exact distance — only after selection when coordinates are shared. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m away`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km away`;
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** When shown on discovery cards — compact, no scheduling jargon. */
export function formatWhenDiscover(scheduledFor: string | null): string {
  if (!scheduledFor) return 'Now';

  const date = new Date(scheduledFor);
  if (isToday(date)) return `Today · ${format(date, 'h:mm a')}`;
  if (isTomorrow(date)) return `Tomorrow · ${format(date, 'h:mm a')}`;
  if (isThisYear(date)) return `${format(date, 'EEE d MMM')} · ${format(date, 'h:mm a')}`;
  return `${format(date, 'd MMM yyyy')} · ${format(date, 'h:mm a')}`;
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
