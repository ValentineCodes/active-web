import { describe, expect, it } from 'vitest';

import {
  assertLiveCameraProfilePhotoSource,
  canSatisfyProfilePhotoRequirement,
  hasProfilePhotoReady,
} from '@/features/profile/profile-photo-policy';

describe('profile photo policy', () => {
  it('only live camera satisfies the requirement', () => {
    expect(canSatisfyProfilePhotoRequirement('live_camera')).toBe(true);
    expect(canSatisfyProfilePhotoRequirement('gallery_file')).toBe(false);
    expect(() => assertLiveCameraProfilePhotoSource('gallery_file')).toThrow(/live profile photo/i);
  });

  it('requires avatar_captured_in_app from confirm_avatar_capture', () => {
    expect(
      hasProfilePhotoReady({ avatar_path: 'uid/avatar.jpg', avatar_captured_in_app: true }),
    ).toBe(true);
    expect(
      hasProfilePhotoReady({ avatar_path: 'uid/avatar.jpg', avatar_captured_in_app: false }),
    ).toBe(false);
  });
});
