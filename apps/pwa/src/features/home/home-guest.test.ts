import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  homeHeaderUsesAccountData,
  shouldPersistDiscoveryCoordinates,
  showHomeActiveRequestBanner,
} from '@/features/home/home-guest';
import { formatGreetingPeriod } from '@/lib/format';

describe('guest home', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not use profile or wallet data for guest header', () => {
    expect(homeHeaderUsesAccountData(false)).toBe(false);
    expect(homeHeaderUsesAccountData(true)).toBe(true);
  });

  it('hides the active request banner for guests', () => {
    const active = { id: 'r1', title: 'Fix sink' };
    expect(showHomeActiveRequestBanner(false, active)).toBe(false);
    expect(showHomeActiveRequestBanner(true, active)).toBe(true);
    expect(showHomeActiveRequestBanner(true, null)).toBe(false);
  });

  it('skips discovery coordinate recording for guests', () => {
    expect(shouldPersistDiscoveryCoordinates(false)).toBe(false);
    expect(shouldPersistDiscoveryCoordinates(true)).toBe(true);
  });

  it('renders time-of-day greeting only for guests', () => {
    vi.setSystemTime(new Date('2026-03-15T08:30:00'));
    expect(formatGreetingPeriod()).toBe('Good morning');

    vi.setSystemTime(new Date('2026-03-15T14:00:00'));
    expect(formatGreetingPeriod()).toBe('Good afternoon');

    vi.setSystemTime(new Date('2026-03-15T20:00:00'));
    expect(formatGreetingPeriod()).toBe('Good evening');
  });
});