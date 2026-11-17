import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultMilestoneDraftItems,
  milestoneItemsSumKobo,
  validateMilestoneDraftItems,
} from './milestones.ts';

test('accepts a plan that sums to the offer (integer arithmetic)', () => {
  const drafts = defaultMilestoneDraftItems().map((row, index) => ({
    ...row,
    title: index === 0 ? 'First' : 'Second',
    amount: index === 0 ? '6000' : '4000',
  }));

  const result = validateMilestoneDraftItems(drafts, 10_000);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.items.length, 2);
    assert.equal(milestoneItemsSumKobo(result.items, 10_000), true);
  }
});

test('rejects fewer than two milestones', () => {
  const drafts = defaultMilestoneDraftItems().slice(0, 1);
  drafts[0].title = 'Only one';
  drafts[0].amount = '5000';

  const result = validateMilestoneDraftItems(drafts, 5000);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /at least 2/i);
  }
});

test('rejects when totals do not match', () => {
  const drafts = defaultMilestoneDraftItems().map((row, index) => ({
    ...row,
    title: index === 0 ? 'A' : 'B',
    amount: index === 0 ? '3000' : '3000',
  }));

  const result = validateMilestoneDraftItems(drafts, 10_000);
  assert.equal(result.ok, false);
});