import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deliveryDurationToSeconds,
  formatInDurationPreview,
  initialProposedDeliveryDuration,
  MAX_DELIVERY_SECONDS,
  maxValueForDeliveryUnit,
  validateProposedDeliveryDuration,
} from './delivery-duration.ts';

test('deliveryDurationToSeconds for every unit', () => {
  assert.equal(deliveryDurationToSeconds(30, 'minutes'), 1800);
  assert.equal(deliveryDurationToSeconds(5, 'hours'), 18_000);
  assert.equal(deliveryDurationToSeconds(3, 'days'), 259_200);
  assert.equal(deliveryDurationToSeconds(2, 'weeks'), 1_209_600);
});

test('normalized duration at 30-day maximum', () => {
  assert.equal(deliveryDurationToSeconds(30, 'days'), MAX_DELIVERY_SECONDS);
  assert.equal(deliveryDurationToSeconds(720, 'hours'), MAX_DELIVERY_SECONDS);
  assert.equal(deliveryDurationToSeconds(43_200, 'minutes'), MAX_DELIVERY_SECONDS);
  assert.equal(validateProposedDeliveryDuration(30, 'days'), null);
  assert.equal(validateProposedDeliveryDuration(720, 'hours'), null);
  assert.equal(validateProposedDeliveryDuration(43_200, 'minutes'), null);
  assert.match(validateProposedDeliveryDuration(31, 'days') ?? '', /30 days/i);
  assert.match(validateProposedDeliveryDuration(43_201, 'minutes') ?? '', /30 days/i);
  assert.match(validateProposedDeliveryDuration(721, 'hours') ?? '', /30 days/i);
});

test('validateProposedDeliveryDuration bounds', () => {
  assert.equal(validateProposedDeliveryDuration(1, 'minutes'), null);
  assert.match(validateProposedDeliveryDuration(0, 'days') ?? '', /greater than zero/i);
  assert.match(validateProposedDeliveryDuration(1.5, 'days') ?? '', /whole number/i);
  assert.match(validateProposedDeliveryDuration(5, 'weeks') ?? '', /30 days/i);
  assert.equal(validateProposedDeliveryDuration(4, 'weeks'), null);
});

test('maxValueForDeliveryUnit', () => {
  assert.equal(maxValueForDeliveryUnit('weeks'), 4);
  assert.equal(maxValueForDeliveryUnit('days'), 30);
  assert.equal(maxValueForDeliveryUnit('hours'), 720);
  assert.equal(maxValueForDeliveryUnit('minutes'), 43_200);
});

test('formatInDurationPreview', () => {
  assert.equal(formatInDurationPreview(5, 'hours'), 'In 5 hours');
  assert.equal(formatInDurationPreview(1, 'week'), 'In 1 week');
});

test('initialProposedDeliveryDuration', () => {
  assert.deepEqual(
    initialProposedDeliveryDuration({ value: 6, unit: 'hours' }),
    { value: 6, unit: 'hours' },
  );
  assert.deepEqual(initialProposedDeliveryDuration({ value: null, unit: 'days' }), {
    value: 3,
    unit: 'days',
  });
  assert.deepEqual(initialProposedDeliveryDuration({ value: 2, unit: null }), {
    value: 3,
    unit: 'days',
  });
});