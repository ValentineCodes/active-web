/** Product defaults — aligned with the native app (`apps/mobile/src/config.ts`). */
export const MARKET = {
  dialCode: '+234',
  currency: 'NGN',
  currencySymbol: '₦',
  /** Reference point for guest `browse_request` reads — not the visitor's device location. */
  guestBrowseReference: { latitude: 6.5244, longitude: 3.3792 },
} as const;
