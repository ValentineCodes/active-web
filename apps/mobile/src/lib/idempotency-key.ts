/** Idempotency keys for wallet/project RPCs — `crypto` is not global on React Native. */
export function createIdempotencyKey(prefix = 'id'): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}