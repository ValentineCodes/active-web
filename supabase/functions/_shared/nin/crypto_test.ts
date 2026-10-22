import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { ciphertextBundleFromRpc, decryptNin, encryptNin } from './crypto.ts';

const testKey = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));

Deno.test('encrypt and decrypt roundtrip', async () => {
  const nin = '12345678901';
  const { ciphertext, nonce } = await encryptNin(nin, testKey);
  const restored = await decryptNin(ciphertext, nonce, testKey);
  assertEquals(restored, nin);
});

Deno.test('ciphertextBundleFromRpc decodes hex from database RPC', async () => {
  const nin = '98765432109';
  const { ciphertext, nonce } = await encryptNin(nin, testKey);
  const hex = (bytes: Uint8Array) =>
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  const { ciphertext: decodedCipher, nonce: decodedNonce } = ciphertextBundleFromRpc({
    ciphertext_hex: hex(ciphertext),
    nonce_hex: hex(nonce),
  });
  const restored = await decryptNin(decodedCipher, decodedNonce, testKey);
  assertEquals(restored, nin);
});
