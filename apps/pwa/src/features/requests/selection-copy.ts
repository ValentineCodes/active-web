/** User-facing copy when someone is chosen to help. */

export function chooseResponderDialog(displayName: string | null) {
  const name = displayName?.trim() || 'this person';

  return {
    title: `Choose ${name}?`,
    message:
      'You can only choose one person. Your exact location and phone number are shared with them. Everyone else is turned down.',
    cancel: 'Not yet',
    confirm: `Choose ${name}`,
  };
}
