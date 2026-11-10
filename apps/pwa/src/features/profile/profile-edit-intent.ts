const OPEN_LIVE_PHOTO_KEY = 'active:profile-edit:open-live-photo';

export function requestProfileEditLivePhoto() {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(OPEN_LIVE_PHOTO_KEY, '1');
}

export function consumeProfileEditLivePhotoIntent(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  const shouldOpen = sessionStorage.getItem(OPEN_LIVE_PHOTO_KEY) === '1';
  if (shouldOpen) sessionStorage.removeItem(OPEN_LIVE_PHOTO_KEY);
  return shouldOpen;
}
