function decodeBase64Key(value: string, label: string): Uint8Array {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is not configured`);
  }
  const binary = atob(trimmed);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  if (bytes.length !== 32) {
    throw new Error(`${label} must be 32 bytes (base64-encoded)`);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function toPostgresByteaHex(bytes: Uint8Array): string {
  return `\\x${bytesToHex(bytes)}`;
}

export async function encryptNin(
  nin: string,
  encryptionKeyBase64: string,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array; keyVersion: string }> {
  const keyBytes = decodeBase64Key(encryptionKeyBase64, 'NIN_ENCRYPTION_KEY');
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const plaintext = new TextEncoder().encode(nin);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    cryptoKey,
    plaintext,
  );
  return {
    ciphertext: new Uint8Array(encrypted),
    nonce,
    keyVersion: 'v1',
  };
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim().replace(/^\\x/i, '');
  if (normalized.length % 2 !== 0) {
    throw new Error('invalid hex payload');
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

export function ciphertextBundleFromRpc(row: { ciphertext_hex: string; nonce_hex: string }): {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
} {
  return {
    ciphertext: hexToBytes(row.ciphertext_hex),
    nonce: hexToBytes(row.nonce_hex),
  };
}

export async function decryptNin(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  encryptionKeyBase64: string,
): Promise<string> {
  const keyBytes = decodeBase64Key(encryptionKeyBase64, 'NIN_ENCRYPTION_KEY');
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource },
    cryptoKey,
    ciphertext as BufferSource,
  );
  return new TextDecoder().decode(decrypted);
}

export async function fingerprintNin(nin: string, fingerprintKeyBase64: string): Promise<string> {
  const keyBytes = decodeBase64Key(fingerprintKeyBase64, 'NIN_FINGERPRINT_KEY');
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(nin));
  return bytesToHex(new Uint8Array(signature));
}
