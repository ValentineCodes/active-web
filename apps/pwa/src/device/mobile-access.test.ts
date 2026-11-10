import { describe, expect, it } from 'vitest';

import { evaluateMobileAccess } from '@/device/mobile-access';

const base = {
  innerWidth: 390,
  innerHeight: 844,
  pointerCoarse: true,
  hoverNone: true,
  pointerFine: false,
  hoverHover: false,
};

describe('evaluateMobileAccess', () => {
  it('allows typical phone portrait', () => {
    expect(evaluateMobileAccess(base)).toBe(true);
  });

  it('allows phone landscape (short edge still phone-sized)', () => {
    expect(
      evaluateMobileAccess({
        ...base,
        innerWidth: 844,
        innerHeight: 390,
      }),
    ).toBe(true);
  });

  it('blocks likely desktop fine-pointer layout', () => {
    expect(
      evaluateMobileAccess({
        innerWidth: 1280,
        innerHeight: 800,
        pointerCoarse: false,
        hoverNone: false,
        pointerFine: true,
        hoverHover: true,
      }),
    ).toBe(false);
  });

  it('allows narrow desktop window for local dev', () => {
    expect(
      evaluateMobileAccess({
        innerWidth: 800,
        innerHeight: 600,
        pointerCoarse: false,
        hoverNone: false,
        pointerFine: true,
        hoverHover: true,
      }),
    ).toBe(true);
  });
});
