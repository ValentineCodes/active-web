import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { PaystackApiError } from './client.ts';
import { mapResolutionFailure } from './resolution-response.ts';

Deno.test('maps Paystack 422 to not_found', () => {
  const mapped = mapResolutionFailure(new PaystackApiError('Could not resolve account', 422));
  assertEquals(mapped.status, 422);
  assertEquals(mapped.body.code, 'not_found');
});

Deno.test('maps Paystack 429 to rate_limited', () => {
  const mapped = mapResolutionFailure(new PaystackApiError('Too many requests', 429));
  assertEquals(mapped.status, 429);
  assertEquals(mapped.body.code, 'rate_limited');
});

Deno.test('maps Paystack 5xx to provider_unavailable', () => {
  const mapped = mapResolutionFailure(new PaystackApiError('Server error', 500));
  assertEquals(mapped.status, 503);
  assertEquals(mapped.body.code, 'provider_unavailable');
});

Deno.test('maps timeout to provider_unavailable not not_found', () => {
  const mapped = mapResolutionFailure(new PaystackApiError('Paystack request timed out', 0));
  assertEquals(mapped.body.code, 'provider_unavailable');
});

Deno.test('maps network error to provider_unavailable', () => {
  const mapped = mapResolutionFailure(new PaystackApiError('Paystack network error', 0));
  assertEquals(mapped.body.code, 'provider_unavailable');
});
