/** Best-effort per-isolate throttle for account resolution (not a global quota). */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

const buckets = new Map<string, number[]>();

export function assertResolveRateLimit(userId: string, nowMs = Date.now()): void {
  const windowStart = nowMs - WINDOW_MS;
  const prior = buckets.get(userId) ?? [];
  const inWindow = prior.filter((t) => t >= windowStart);
  if (inWindow.length >= MAX_REQUESTS_PER_WINDOW) {
    throw new ResolveRateLimitError();
  }
  inWindow.push(nowMs);
  buckets.set(userId, inWindow);
}

export class ResolveRateLimitError extends Error {
  constructor() {
    super('resolve rate limit exceeded');
    this.name = 'ResolveRateLimitError';
  }
}

export function resetResolveRateLimits(): void {
  buckets.clear();
}
