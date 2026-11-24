export type InstallCoachPlatform = 'desktop' | 'ios' | 'android-chromium' | 'other-mobile';

export function detectIosDevice(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua);
}

export function detectIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos = detectIosDevice();
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

export function detectInstallCoachPlatform(): InstallCoachPlatform {
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);

  if (detectIosDevice()) return 'ios';

  if (isAndroid && /Chrome/i.test(ua)) return 'android-chromium';
  if (isAndroid) return 'other-mobile';

  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const hoverHover = window.matchMedia('(hover: hover)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const likelyDesktop = finePointer && hoverHover && !coarse && window.innerWidth >= 768;
  if (likelyDesktop) return 'desktop';

  return 'other-mobile';
}

export function installCoachInstruction(platform: InstallCoachPlatform): string {
  switch (platform) {
    case 'desktop': {
      const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      return mac ? 'Press ⌘+D right now!' : 'Press Ctrl+D right now!';
    }
    case 'ios':
      return 'Tap Share → Add to Home Screen.';
    case 'android-chromium':
      return 'Tap Menu ⋮ → Install app or Add to Home screen.';
    case 'other-mobile':
      return 'Tap Menu ⋮ → Bookmark or Add to Home screen.';
  }
}