import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  paystackTransactionIsSuccessful,
  paystackTransactionIsTerminalFailure,
} from './paystack-transaction-status.ts';

Deno.test('paystack success', () => {
  assertEquals(paystackTransactionIsSuccessful('success'), true);
  assertEquals(paystackTransactionIsTerminalFailure('success'), false);
});

Deno.test('paystack pending is not terminal', () => {
  assertEquals(paystackTransactionIsSuccessful('pending'), false);
  assertEquals(paystackTransactionIsTerminalFailure('pending'), false);
});

Deno.test('paystack failed statuses', () => {
  assertEquals(paystackTransactionIsTerminalFailure('failed'), true);
  assertEquals(paystackTransactionIsTerminalFailure('abandoned'), true);
  assertEquals(paystackTransactionIsTerminalFailure('reversed'), true);
});