let pendingSessionExpiredOnEntryToast = false;

export function markSessionExpiredOnEntryToast() {
  pendingSessionExpiredOnEntryToast = true;
}

export function consumeSessionExpiredOnEntryToast(): boolean {
  if (!pendingSessionExpiredOnEntryToast) return false;
  pendingSessionExpiredOnEntryToast = false;
  return true;
}
