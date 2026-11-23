/** Whether the home header may show account-specific chrome (profile link, wallet). */
export function homeHeaderUsesAccountData(hasSession: boolean): boolean {
  return hasSession;
}

/** Active engagement banner is signed-in only. */
export function showHomeActiveRequestBanner(
  hasSession: boolean,
  activeRequest: { id: string; title: string } | null | undefined,
): boolean {
  return hasSession && Boolean(activeRequest);
}

/** Discovery coordinate persistence is for signed-in users only. */
export function shouldPersistDiscoveryCoordinates(hasSession: boolean): boolean {
  return hasSession;
}