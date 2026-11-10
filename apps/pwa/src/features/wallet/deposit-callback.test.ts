import { describe, expect, it } from 'vitest';

import { depositCallbackUrl, referenceFromSearchParams } from '@/features/wallet/deposit-callback';

describe('deposit-callback', () => {
  it('builds callback url on current origin', () => {
    expect(depositCallbackUrl()).toMatch(/\/wallet\/deposit\/callback$/);
  });

  it('reads paystack reference from query', () => {
    const params = new URLSearchParams('trxref=active-dep-abc');
    expect(referenceFromSearchParams(params)).toBe('active-dep-abc');
  });
});
