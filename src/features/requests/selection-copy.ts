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

export function chosenResponderMessage(displayName: string | null) {
  const name = displayName?.trim() || 'them';
  return `You've chosen ${name}. Open the connection for contact details and the exact meeting location.`;
}

export function helpingYouTitle(displayName: string | null) {
  const name = displayName?.trim();
  if (name) return `${name} is helping you`;
  return 'Someone is helping you';
}
