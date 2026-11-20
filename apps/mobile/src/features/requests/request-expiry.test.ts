import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expirySummaryLabel,
  localDateIso,
  validateRequestExpiryChoice,
} from './request-expiry-core.ts';

test('labels today expiry', () => {
  assert.equal(expirySummaryLabel('today', new Date('2026-11-20T12:00:00Z')), 'Today at 11:59 PM');
});

test('formats future expiry labels', () => {
  const label = expirySummaryLabel('future', new Date('2026-11-25T15:30:00Z'));
  assert.match(label, /Nov/);
});

test('requires a future instant for future mode', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  const past = new Date('2026-11-19T12:00:00Z');
  assert.match(validateRequestExpiryChoice('future', past, now) ?? '', /future/i);
  assert.equal(validateRequestExpiryChoice('today', past, now), null);
});

test('emits local date ISO', () => {
  assert.equal(localDateIso(new Date(2026, 10, 9)), '2026-11-09');
});