import { describe, expect, it } from 'vitest';

import {
  defaultMilestoneDraftItems,
  milestoneItemsSumKobo,
  validateMilestoneDraftItems,
} from '@/features/requests/milestones';

describe('milestone draft validation', () => {
  it('defaults to single-payment-safe validation path when not milestone', () => {
    const drafts = defaultMilestoneDraftItems();
    const result = validateMilestoneDraftItems(drafts, 0);
    expect(result.ok).toBe(false);
  });

  it('accepts a plan that sums to the offer', () => {
    const drafts = defaultMilestoneDraftItems().map((row, index) => ({
      ...row,
      title: index === 0 ? 'First' : 'Second',
      amount: index === 0 ? '6000' : '4000',
    }));

    const result = validateMilestoneDraftItems(drafts, 10_000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(milestoneItemsSumKobo(result.items, 10_000)).toBe(true);
    }
  });

  it('rejects mismatched totals', () => {
    const drafts = defaultMilestoneDraftItems().map((row, index) => ({
      ...row,
      title: index === 0 ? 'A' : 'B',
      amount: '3000',
    }));

    expect(validateMilestoneDraftItems(drafts, 10_000).ok).toBe(false);
  });
});