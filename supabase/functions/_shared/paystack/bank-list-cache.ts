import type { PaystackBank } from './types.ts';

const CACHE_TTL_MS = 60 * 60 * 1000;

let cachedBanks: PaystackBank[] | null = null;
let cachedAtMs = 0;

export function readCachedBanks(nowMs = Date.now()): PaystackBank[] | null {
  if (!cachedBanks) return null;
  if (nowMs - cachedAtMs > CACHE_TTL_MS) {
    cachedBanks = null;
    cachedAtMs = 0;
    return null;
  }
  return cachedBanks;
}

export function writeCachedBanks(banks: PaystackBank[], nowMs = Date.now()): void {
  cachedBanks = banks;
  cachedAtMs = nowMs;
}

export function clearBankListCache(): void {
  cachedBanks = null;
  cachedAtMs = 0;
}
