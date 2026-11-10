import { describe, expect, it } from 'vitest';

import { isPlausiblePhone, toE164 } from '@/features/auth/phone';

describe('phone auth helpers', () => {
  it('normalises local trunk zero to E.164', () => {
    expect(toE164('08012345678')).toBe('+2348012345678');
  });

  it('accepts plausible Nigerian lengths', () => {
    expect(isPlausiblePhone('08012345678')).toBe(true);
    expect(isPlausiblePhone('123')).toBe(false);
  });
});
