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
  /** Shown in the UI instead of the ISO code. */
  currencySymbol: '₦',
} as const;

export const TITLE_LIMITS = { min: 3, max: 120 } as const;

/** Create-request title field — shorter than DB max so home cards stay one line. */
export const CREATE_TITLE_LIMITS = { min: TITLE_LIMITS.min, max: 50 } as const;

export const DESCRIPTION_LIMITS = { min: 1, max: 1000 } as const;

/**
 * When true, a request must carry a positive offer before it enters discovery. That
 * matches payment_status moving to `locked` on create.
 */
export const REQUEST_REQUIRES_FUNDING = true;

/** Active's service fee as a fraction of the offer (10% → 0.1), deducted at payout. */
export const SERVICE_FEE_RATE = 0.1;

/** Wallet presentation. Balances and ledger writes remain server-authoritative. */
export const WALLET = {
  /** Preset amounts on the add-money screen. */
  addMoneyAmounts: [1000, 5000, 10_000, 20_000] as const,
  /** Min/max whole-naira deposit (server validates again in kobo). */
  depositMinMajor: 100,
  depositMaxMajor: 1_000_000,
  /** Max rows per history page (server cap 200). */
  historyPageSize: 25,
  /** Max transaction rows loaded for wallet home preview query. */
  activityLimit: 50,
  /** Rows shown on the wallet home screen. */
  previewActivityCount: 4,
  buckets: {
    available: 'Available',
    locked: 'Held for open requests',
    pending: 'Held until completed',
  },
} as const;

/**
 * Chat attachment limits and allowlists. The database enforces the same rules again on
 * `begin_request_message_with_attachments` and `complete_request_message_with_attachments`.
 * When changing limits or types, update `supabase/migrations/*conversation_attachment_validation*`
 * (or the latest conversation attachment policy migration) to match.
 */
export const CONVERSATION_ATTACHMENTS = {
  maxPerMessage: 10,
  maxBytes: {
    image: 5 * 1024 * 1024,
    video: 50 * 1024 * 1024,
    file: 25 * 1024 * 1024,
  },
  mimeTypes: {
    image: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const,
    video: ['video/mp4', 'video/quicktime', 'video/3gpp', 'video/3gpp2'] as const,
    file: [
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/rtf',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
    ] as const,
  },
  extensions: {
    image: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] as const,
    video: ['mp4', 'mov', '3gp', '3g2'] as const,
    file: ['pdf', 'txt', 'csv', 'doc', 'docx', 'xls', 'xlsx', 'rtf', 'odt', 'ods'] as const,
  },
  blockedExtensions: [
    'exe',
    'msi',
    'bat',
    'cmd',
    'com',
    'scr',
    'ps1',
    'sh',
    'bash',
    'apk',
    'ipa',
    'dll',
    'vbs',
    'js',
    'mjs',
    'cjs',
    'jar',
    'dmg',
    'pkg',
    'deb',
    'rpm',
    'app',
    'hta',
    'wsf',
    'cpl',
    'msc',
    'reg',
    'iso',
  ] as const,
  blockedMimeTypes: [
    'application/x-msdownload',
    'application/x-msdos-program',
    'application/x-executable',
    'application/x-sh',
    'application/javascript',
    'text/javascript',
    'application/vnd.android.package-archive',
    'application/octet-stream',
  ] as const,
} as const;
