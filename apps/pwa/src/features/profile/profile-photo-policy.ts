/**
 * Profile photos that satisfy chat (`avatar_captured_in_app`) must come from live camera
 * capture in this client. Gallery/file selection must never call `confirm_avatar_capture`.
 */
export type ProfilePhotoCaptureSource = 'live_camera' | 'gallery_file';

export function canSatisfyProfilePhotoRequirement(source: ProfilePhotoCaptureSource): boolean {
  return source === 'live_camera';
}

export function assertLiveCameraProfilePhotoSource(source: ProfilePhotoCaptureSource): void {
  if (!canSatisfyProfilePhotoRequirement(source)) {
    throw new Error('Choose Take photo to capture a live profile photo. Gallery uploads do not count.');
  }
}

export function hasProfilePhotoReady(
  profile: Pick<ProfileRowLike, 'avatar_path' | 'avatar_captured_in_app'> | null | undefined,
): boolean {
  return Boolean(profile?.avatar_path && profile.avatar_captured_in_app);
}

type ProfileRowLike = {
  avatar_path: string | null;
  avatar_captured_in_app: boolean;
};
