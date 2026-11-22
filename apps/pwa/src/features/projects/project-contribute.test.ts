import { describe, expect, it } from 'vitest';

import {
  projectContributionAmountPresets,
  projectContributionRemainingMajor,
} from '@/features/projects/project-contribute';

describe('projectContributionRemainingMajor', () => {
  it('returns whole naira left in the pool', () => {
    expect(projectContributionRemainingMajor(1_000_000, 250_000)).toBe(7500);
    expect(projectContributionRemainingMajor(500_000, 500_000)).toBe(0);
  });
});

describe('projectContributionAmountPresets', () => {
  it('includes min and max', () => {
    const presets = projectContributionAmountPresets(500, 50_000);
    expect(presets[0]).toBe(500);
    expect(presets[presets.length - 1]).toBe(50_000);
  });

  it('returns a single pill when min equals max', () => {
    expect(projectContributionAmountPresets(2000, 2000)).toEqual([2000]);
  });

  it('returns empty when no capacity remains', () => {
    expect(projectContributionAmountPresets(500, 0)).toEqual([]);
  });
});