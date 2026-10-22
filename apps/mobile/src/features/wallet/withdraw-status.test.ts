import assert from 'node:assert/strict';

import {
  walletWithdrawalStatusDescription,
  walletWithdrawalStatusLabel,
} from './withdraw-status.ts';

assert.equal(walletWithdrawalStatusLabel('pending'), 'Pending');
assert.equal(walletWithdrawalStatusLabel('processing'), 'Processing');
assert.equal(walletWithdrawalStatusLabel('completed'), 'Completed');
assert.equal(walletWithdrawalStatusLabel('rejected'), 'Rejected');
assert.equal(walletWithdrawalStatusLabel('failed'), 'Failed');

assert.match(walletWithdrawalStatusDescription('pending'), /Awaiting review/);
assert.match(walletWithdrawalStatusDescription('completed'), /Transfer confirmed/);
assert.match(walletWithdrawalStatusDescription('rejected'), /returned/);

console.log('withdraw-status.test.ts ok');
