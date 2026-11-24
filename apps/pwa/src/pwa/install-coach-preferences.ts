const INSTALL_COACH_DISMISSED_KEY = 'active/install_coach_dismissed';
const INSTALL_COACH_SESSION_SNOOZE_KEY = 'active/install_coach_snoozed';

/** Permanent dismiss (Got it) — survives new tabs until cleared. */
export function readInstallCoachDismissed(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(INSTALL_COACH_DISMISSED_KEY) === '1';
}

export function setInstallCoachDismissed(dismissed: boolean): void {
  if (typeof window === 'undefined') return;
  if (dismissed) window.localStorage.setItem(INSTALL_COACH_DISMISSED_KEY, '1');
  else window.localStorage.removeItem(INSTALL_COACH_DISMISSED_KEY);
}

/** Tab-session snooze (Not now) — cleared when the browser tab is closed. */
export function readInstallCoachSessionSnoozed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(INSTALL_COACH_SESSION_SNOOZE_KEY) === '1';
}

export function setInstallCoachSessionSnoozed(snoozed: boolean): void {
  if (typeof window === 'undefined') return;
  if (snoozed) window.sessionStorage.setItem(INSTALL_COACH_SESSION_SNOOZE_KEY, '1');
  else window.sessionStorage.removeItem(INSTALL_COACH_SESSION_SNOOZE_KEY);
}