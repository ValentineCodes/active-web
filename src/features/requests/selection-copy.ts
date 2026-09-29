/** User-facing copy for choosing someone to help (backend still uses handshakes). */

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
  return `You've chosen ${name}. Open the job for contact details and the exact meeting location.`;
}

export function helpingYouTitle(displayName: string | null) {
  const name = displayName?.trim() || 'Your helper';
  return `${name} is helping you`;
}
