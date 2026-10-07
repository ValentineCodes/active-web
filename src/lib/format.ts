import {
  format,
  formatDistanceToNowStrict,
  isThisYear,
  isToday,
  isTomorrow,
  isYesterday,
} from 'date-fns';

import { MARKET } from '@/config';

export function formatFileSizeBytes(bytes: number | null | undefined): string | null {
  if (bytes == null || bytes < 1) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

/** Area line for offer/when cards — not the full street address. */
export function formatCoarseLocationLabel(locationLabel: string): string {
  const parts = locationLabel
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 2) return locationLabel;
  return parts.slice(-2).join(', ');
}

/** Location column beside “When” on request-flow cards (proximity when known). */
export function formatRequestOfferLocationLabel(
  locationLabel: string,
  distanceM: number | null | undefined,
): string {
  if (distanceM != null) return formatProximityHome(distanceM);
  return formatCoarseLocationLabel(locationLabel);
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

/** Server notification copy still uses ISO codes in some rows; normalize for display. */
export function formatNotificationCopy(text: string): string {
  return text.replace(/(\d+(?:\.\d+)?)\s+NGN\b/gi, (_, amount: string) =>
    formatMoney(Number(amount), MARKET.currency),
  );
}

export function formatMoney(amount: number, currency: string): string {
  const amountLabel = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(amount);

  if (currency.toUpperCase() === MARKET.currency) {
    return `${MARKET.currencySymbol}${amountLabel}`;
  }

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** E.164 phone numbers for display (e.g. +234 801 234 5678). */
export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const countryCode = MARKET.dialCode.replace('+', '');

  if (digits.startsWith(countryCode) && digits.length >= countryCode.length + 7) {
    const national = digits.slice(countryCode.length);
    const grouped = [national.slice(0, 3), national.slice(3, 6), national.slice(6)].filter(
      (part) => part.length > 0,
    );
    return `${MARKET.dialCode} ${grouped.join(' ')}`;
  }

  if (phone.startsWith('+')) return phone;
  return digits.length > 0 ? `+${digits}` : phone;
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

/** Short when label for request offer cards (Today / Tomorrow / weekday). */
export function formatWhenRequestCard(scheduledFor: string | null): string {
  if (!scheduledFor) return 'Today';

  const date = new Date(scheduledFor);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isThisYear(date)) return format(date, 'EEEE');
  return format(date, 'd MMM yyyy');
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

/** Time label on chat bubbles — compact when recent, dated when older. */
export function formatChatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return `Yesterday ${format(date, 'h:mm a')}`;
  if (isThisYear(date)) return format(date, 'EEE d MMM, h:mm a');
  return format(date, 'd MMM yyyy, h:mm a');
}

export function formatRating(average: number | null, count: number): string {
  if (count === 0 || average === null) return 'No ratings yet';
  return `${average.toFixed(1)} (${count})`;
}
