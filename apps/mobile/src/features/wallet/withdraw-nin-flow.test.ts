import assert from 'node:assert/strict';

import {
  isIdentityVerificationWithdrawalError,
  shouldCollectNinBeforeWithdrawal,
} from './withdraw-nin-flow.ts';

assert.equal(shouldCollectNinBeforeWithdrawal(false, false), false);
assert.equal(shouldCollectNinBeforeWithdrawal(true, false), true);
assert.equal(shouldCollectNinBeforeWithdrawal(true, true), false);
assert.equal(shouldCollectNinBeforeWithdrawal(undefined, false), false);

assert.equal(
  isIdentityVerificationWithdrawalError({ code: 'identity_verification_required' }),
  true,
);
assert.equal(isIdentityVerificationWithdrawalError(new Error('other')), false);

console.log('withdraw-nin-flow.test.ts ok');
