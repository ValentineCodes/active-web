import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canDismissFailureToStart,
  canDismissMissedDeliveryUi,
  dismissalConfirmationCopy,
  formatCountdownDuration,
  helperShowStartButton,
  isStartWindowOpen,
  startWindowRemainingMs,
  validateProposedDeliveryAt,
} from './engagement-lifecycle.ts';

test('validateProposedDeliveryAt rejects past times', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  assert.equal(
    validateProposedDeliveryAt(new Date('2026-06-01T11:00:00Z'), now),
    'Choose a delivery time in the future.',
  );
  assert.equal(validateProposedDeliveryAt(new Date('2026-06-02T12:00:00Z'), now), null);
});

test('start window open only for accepted without start', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  const startBy = '2026-06-01T18:00:00Z';
  assert.equal(isStartWindowOpen('accepted', null, startBy, now), true);
  assert.equal(isStartWindowOpen('accepted', startBy, startBy, now), false);
  assert.equal(isStartWindowOpen('in_progress', null, startBy, now), false);
});

test('helper start button visibility', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  assert.equal(
    helperShowStartButton({
      viewerIsRequester: false,
      requestStatus: 'accepted',
      startedAt: null,
      startByAt: '2026-06-01T18:00:00Z',
      now,
    }),
    true,
  );
  assert.equal(
    helperShowStartButton({
      viewerIsRequester: true,
      requestStatus: 'accepted',
      startedAt: null,
      startByAt: '2026-06-01T18:00:00Z',
      now,
    }),
    false,
  );
});

test('countdown formatting', () => {
  assert.equal(formatCountdownDuration(90_000), '1m 30s');
  assert.equal(formatCountdownDuration(3_600_000), '1h 0m');
});

test('startWindowRemainingMs', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  assert.equal(startWindowRemainingMs('2026-06-01T13:00:00Z', now), 3_600_000);
  assert.equal(startWindowRemainingMs('2026-06-01T11:00:00Z', now), -3_600_000);
});

test('dismissal availability', () => {
  const now = new Date('2026-06-02T12:00:00Z');
  assert.equal(
    canDismissFailureToStart({
      viewerIsRequester: true,
      requestStatus: 'accepted',
      startedAt: null,
      startByAt: '2026-06-01T10:00:00Z',
      now,
    }),
    true,
  );
  assert.equal(
    canDismissMissedDeliveryUi({
      viewerIsRequester: true,
      requestStatus: 'in_progress',
      startedAt: '2026-06-01T08:00:00Z',
      deliveryDeadlineAt: '2026-06-02T10:00:00Z',
      paymentStatus: 'locked',
      now,
    }),
    true,
  );
  assert.equal(
    canDismissMissedDeliveryUi({
      viewerIsRequester: true,
      requestStatus: 'in_progress',
      startedAt: '2026-06-01T08:00:00Z',
      deliveryDeadlineAt: '2026-06-03T10:00:00Z',
      paymentStatus: 'locked',
      now,
    }),
    false,
  );
});

test('dismissal copy distinguishes failure to start and missed delivery', () => {
  const failure = dismissalConfirmationCopy('failure_to_start');
  const missed = dismissalConfirmationCopy('missed_delivery');
  assert.match(failure.message, /24 hours/i);
  assert.match(missed.message, /delivery deadline/i);
  assert.notEqual(failure.financialNote, missed.financialNote);
});