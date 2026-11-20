/** Mirrors `public.normalize_username` — format only; uniqueness is server-side. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

const USERNAME_PATTERN = /^[a-z0-9_]+$/;

const RESERVED_USERNAMES = new Set(['admin', 'support', 'active', 'help', 'root', 'system']);

export function normalizeUsernameInput(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsernameFormat(raw: string): string | null {
  const username = normalizeUsernameInput(raw);
  if (username.length === 0) {
    return null;
  }
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return `Usernames must be ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters.`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return 'Use only lowercase letters, numbers, and underscores.';
  }
  if (RESERVED_USERNAMES.has(username)) {
    return 'This username is not available.';
  }
  return null;
}

export function mapUsernameMutationError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message: string }).message)
        : 'Could not save username.';

  const lower = message.toLowerCase();
  if (lower.includes('already taken')) return 'That username is already taken.';
  if (lower.includes('not available')) return 'This username is not available.';
  if (lower.includes('between 3 and 30')) return `Usernames must be ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters.`;
  if (lower.includes('letters, numbers, and underscores')) {
    return 'Use only lowercase letters, numbers, and underscores.';
  }
  if (lower.includes('username is required')) return 'Enter a username.';
  return message;
}

export function sanitizeUsernameDraft(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, USERNAME_MAX_LENGTH);
}