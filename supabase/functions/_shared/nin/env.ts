export type NinCryptoConfig = {
  encryptionKeyBase64: string;
  fingerprintKeyBase64: string;
};

export function loadNinCryptoConfig(): NinCryptoConfig {
  const encryptionKeyBase64 = Deno.env.get('NIN_ENCRYPTION_KEY')?.trim() ?? '';
  const fingerprintKeyBase64 = Deno.env.get('NIN_FINGERPRINT_KEY')?.trim() ?? '';

  if (!encryptionKeyBase64 || !fingerprintKeyBase64) {
    throw new Error('NIN encryption is not configured on the server');
  }

  return { encryptionKeyBase64, fingerprintKeyBase64 };
}
