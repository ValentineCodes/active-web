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
export const TITLE_LIMITS = { min: 3, max: 120 } as const;

export const DESCRIPTION_LIMITS = { min: 1, max: 1000 } as const;

/**
 * When true, a request must carry a positive offer before it enters discovery. That
 * matches payment_status moving to `locked` on create.
 */
export const REQUEST_REQUIRES_FUNDING = true;

/** Active's service fee as a fraction of the provider amount (10% → 0.1). */
export const SERVICE_FEE_RATE = 0.1;

/** Wallet presentation. Balances and ledger writes remain server-authoritative. */
export const WALLET = {
  /** Amount chips for temporary manual top-up / withdraw until a wallet service is integrated. */
  adjustAmounts: [5000, 10_000, 25_000, 50_000] as const,
  /** Max ledger rows loaded on the wallet screen. */
  activityLimit: 50,
  buckets: {
    available: 'Available',
    locked: 'Locked',
    pending: 'Pending',
  },
} as const;
