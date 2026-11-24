import { describe, expect, it } from 'vitest';

import { installCoachInstruction } from '@/pwa/install-coach-platform';

describe('installCoachInstruction', () => {
  it('gives short platform-specific copy', () => {
    expect(installCoachInstruction('ios')).toContain('Add to Home Screen');
    expect(installCoachInstruction('android-chromium')).toContain('Menu ⋮');
    expect(installCoachInstruction('desktop')).toMatch(/right now/i);
  });
});