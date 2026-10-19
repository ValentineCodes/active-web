import { assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  assertResolveRateLimit,
  resetResolveRateLimits,
  ResolveRateLimitError,
} from './resolve-rate-limit.ts';

Deno.test('allows requests under the per-user limit', () => {
  resetResolveRateLimits();
  const userId = 'user-a';
  for (let i = 0; i < 30; i += 1) {
    assertResolveRateLimit(userId, 1_000 + i);
  }
});

Deno.test('blocks when per-user limit exceeded', () => {
  resetResolveRateLimits();
  const userId = 'user-b';
  for (let i = 0; i < 30; i += 1) {
    assertResolveRateLimit(userId, 10_000 + i);
  }
  assertThrows(() => assertResolveRateLimit(userId, 10_050), ResolveRateLimitError);
});
