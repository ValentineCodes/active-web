/**
 * Product defaults. Anything here is a presentation choice; the database holds the
 * authoritative limits and validates every value again on the way in.
 */

/**
 * Active launches in one market, so numbers are entered locally and normalised to E.164
 * against this dial code. Supporting more markets means turning this into a picker.
 */
export const MARKET = {
  dialCode: '+234',
  /** Matches the `currency` default on public.requests. */
  currency: 'NGN',
} as const;

/** Radius options offered to a requester. Expansion beyond these is server-driven. */
export const SEARCH_RADII_M = [2000, 5000, 10000, 20000] as const;

/** Radius options offered to a provider going Active. */
export const SERVICE_RADII_M = [5000, 10000, 20000, 35000] as const;

/** How long an Active session lasts before it lapses on its own. */
export const ACTIVE_DURATIONS = [
  { minutes: 60, label: '1 hour' },
  { minutes: 240, label: '4 hours' },
  { minutes: 480, label: '8 hours' },
  { minutes: 720, label: '12 hours' },
] as const;

export const DESCRIPTION_LIMITS = { min: 10, max: 1000 } as const;
