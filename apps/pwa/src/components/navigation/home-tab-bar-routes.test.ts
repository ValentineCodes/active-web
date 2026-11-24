import { describe, expect, it } from 'vitest';

import { routeShowsHomeTabBar } from '@/components/navigation/home-tab-bar-routes';

describe('routeShowsHomeTabBar', () => {
  it('matches AppShell tab routes only', () => {
    expect(routeShowsHomeTabBar('/home')).toBe(true);
    expect(routeShowsHomeTabBar('/search')).toBe(true);
    expect(routeShowsHomeTabBar('/notifications')).toBe(true);
    expect(routeShowsHomeTabBar('/profile')).toBe(false);
    expect(routeShowsHomeTabBar('/project/abc')).toBe(false);
    expect(routeShowsHomeTabBar('/messages')).toBe(false);
  });
});