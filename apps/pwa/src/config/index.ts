export { MARKET } from '@/config/market';

export const TITLE_LIMITS = { min: 3, max: 120 } as const;
export const CREATE_TITLE_LIMITS = { min: TITLE_LIMITS.min, max: 50 } as const;
export const DESCRIPTION_LIMITS = { min: 0, max: 1000 } as const;
export const REQUEST_REQUIRES_FUNDING = true;
export const SERVICE_FEE_RATE = 0.1;

export const WALLET = {
  addMoneyAmounts: [1000, 5000, 10_000, 20_000] as const,
  depositMinMajor: 100,
  depositMaxMajor: 1_000_000,
  withdrawMinMajor: 100,
  withdrawMaxMajor: 1_000_000,
  historyPageSize: 25,
  activityLimit: 50,
  previewActivityCount: 4,
  buckets: {
    available: 'Available',
    locked: 'Held for open requests',
    pending: 'Held until completed',
  },
} as const;

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
    'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'sh', 'bash', 'apk', 'ipa', 'dll', 'vbs',
    'js', 'mjs', 'cjs', 'jar', 'dmg', 'pkg', 'deb', 'rpm', 'app', 'hta', 'wsf', 'cpl', 'msc', 'reg', 'iso',
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
