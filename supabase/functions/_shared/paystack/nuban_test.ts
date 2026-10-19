import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  isValidNubanAccountNumber,
  isValidPaystackBankCode,
  parseNubanResolveInput,
} from './nuban.ts';

Deno.test('accepts valid NUBAN and bank code', () => {
  const parsed = parseNubanResolveInput({
    bank_code: '058',
    account_number: '0123456789',
  });
  assertEquals(parsed, {
    ok: true,
    bankCode: '058',
    accountNumber: '0123456789',
  });
});

Deno.test('strips non-digits from account number', () => {
  const parsed = parseNubanResolveInput({
    bank_code: '044',
    account_number: '0123 456 789',
  });
  assertEquals(parsed.ok, true);
  if (parsed.ok) {
    assertEquals(parsed.accountNumber, '0123456789');
  }
});

Deno.test('rejects missing bank code', () => {
  const parsed = parseNubanResolveInput({ account_number: '0123456789' });
  assertEquals(parsed.ok, false);
  if (!parsed.ok) {
    assertEquals(parsed.code, 'invalid_input');
  }
});

Deno.test('rejects invalid bank code', () => {
  assertEquals(isValidPaystackBankCode('AB'), false);
  assertEquals(isValidPaystackBankCode('12'), false);
  assertEquals(isValidPaystackBankCode('058'), true);
});

Deno.test('rejects short account number', () => {
  assertEquals(isValidNubanAccountNumber('123'), false);
  const parsed = parseNubanResolveInput({ bank_code: '058', account_number: '12345' });
  assertEquals(parsed.ok, false);
});
