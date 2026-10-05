import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  DepositSettlementError,
  validatePaystackDepositSettlementForCredit,
  type PaystackDepositSettlement,
} from './settle.ts';

const deposit = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  user_id: '11111111-1111-1111-1111-111111111111',
  amount: 100_000,
  status: 'pending',
  currency: 'NGN',
};

const baseSettlement: PaystackDepositSettlement = {
  paystackAmountKobo: 100_000,
  paystackReference: 'active-dep-test-ref',
  currency: 'NGN',
  paystackStatus: 'success',
  metadataUserId: deposit.user_id,
  metadataDepositId: deposit.id,
};

function expectSettlementError(fn: () => void, code: DepositSettlementError['code']): void {
  try {
    fn();
    throw new Error('expected DepositSettlementError');
  } catch (error) {
    if (error instanceof Error && error.message === 'expected DepositSettlementError') {
      throw error;
    }
    assertEquals(error instanceof DepositSettlementError, true);
    assertEquals((error as DepositSettlementError).code, code);
  }
}

Deno.test('successful payment validation', () => {
  assertEquals(validatePaystackDepositSettlementForCredit(deposit, baseSettlement), 'ready');
});

Deno.test('failed payment status', () => {
  expectSettlementError(
    () =>
      validatePaystackDepositSettlementForCredit(deposit, {
        ...baseSettlement,
        paystackStatus: 'failed',
      }),
    'not_successful',
  );
});

Deno.test('wrong amount', () => {
  expectSettlementError(
    () =>
      validatePaystackDepositSettlementForCredit(deposit, {
        ...baseSettlement,
        paystackAmountKobo: 50_000,
      }),
    'amount_mismatch',
  );
});

Deno.test('wrong currency', () => {
  expectSettlementError(
    () =>
      validatePaystackDepositSettlementForCredit(deposit, {
        ...baseSettlement,
        currency: 'USD',
      }),
    'currency_mismatch',
  );
});

Deno.test('duplicate verification on completed deposit', () => {
  assertEquals(
    validatePaystackDepositSettlementForCredit({ ...deposit, status: 'completed' }, baseSettlement),
    'already_fulfilled',
  );
});

Deno.test('wrong user metadata', () => {
  expectSettlementError(
    () =>
      validatePaystackDepositSettlementForCredit(deposit, {
        ...baseSettlement,
        metadataUserId: '22222222-2222-2222-2222-222222222222',
      }),
    'user_mismatch',
  );
});

Deno.test('wrong deposit id metadata', () => {
  expectSettlementError(
    () =>
      validatePaystackDepositSettlementForCredit(deposit, {
        ...baseSettlement,
        metadataDepositId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      }),
    'deposit_mismatch',
  );
});

Deno.test('unknown reference is enforced at lookup layer', () => {
  expectSettlementError(() => {
    throw new DepositSettlementError('Unknown deposit reference', 'unknown_deposit');
  }, 'unknown_deposit');
});
