import { loadPaystackConfig } from './env.ts';

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      return null;
    }
    bytes[i] = byte;
  }
  return bytes;
}

function timingSafeEqualHex(computed: string, header: string): boolean {
  const a = computed.trim().toLowerCase();
  const b = header.trim().toLowerCase();
  if (a.length !== b.length) {
    return false;
  }

  const aBytes = hexToBytes(a);
  const bBytes = hexToBytes(b);
  if (!aBytes || !bBytes) {
    return false;
  }

  return crypto.timingSafeEqual(aBytes, bBytes);
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validates Paystack `x-paystack-signature` (HMAC SHA512 of raw body).
 * @see https://paystack.com/docs/payments/webhooks/#verify-event-origin
 */
export async function verifyPaystackWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader?.trim()) {
    return false;
  }

  const { secretKey } = loadPaystackConfig();
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );

  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const computed = bytesToHex(digest);

  return timingSafeEqualHex(computed, signatureHeader);
}

export type PaystackWebhookEvent = {
  event: string;
  data: PaystackChargeData;
};

export type PaystackChargeData = {
  reference?: string;
  amount?: number;
  currency?: string;
  status?: string;
  metadata?: Record<string, unknown> | null;
};

export type WalletDepositWebhookMetadata = {
  purpose: 'wallet_deposit';
  userId: string;
  depositId: string | null;
};

function metadataString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

/** Reads Active wallet deposit metadata from Paystack charge payloads. */
export function parseWalletDepositMetadata(
  metadata: Record<string, unknown> | null | undefined,
): WalletDepositWebhookMetadata | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const purpose = metadataString(metadata.purpose);
  if (purpose !== 'wallet_deposit') {
    return null;
  }

  const userId = metadataString(metadata.user_id);
  if (!userId) {
    return null;
  }

  const depositId = metadataString(metadata.deposit_id);

  return {
    purpose: 'wallet_deposit',
    userId,
    depositId,
  };
}
