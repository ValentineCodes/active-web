/** User-facing copy when someone is chosen to help. */

export function chooseResponderDialog(displayName: string | null, milestonePayments?: boolean) {
  const name = displayName?.trim() || 'this person';

  const message = milestonePayments
    ? `You can only choose one person. The full offer is locked from your wallet now. Milestone payments release after you approve each step. Your exact location and phone number are shared with ${name}. Everyone else is turned down.`
    : 'You can only choose one person. Your exact location and phone number are shared with them. Everyone else is turned down.';

  return {
    title: `Choose ${name}?`,
    message,
    cancel: 'Not yet',
    confirm: `Choose ${name}`,
  };
}
