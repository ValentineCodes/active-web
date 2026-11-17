/** Safe in-app return target from `?returnTo=` on conversation routes. */
export function parseConversationReturnTo(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

export function messageThreadHref(conversationId: string, returnTo: string): string {
  const params = new URLSearchParams({ returnTo });
  return `/messages/${conversationId}?${params.toString()}`;
}

/** @deprecated Prefer `messageThreadHref`. */
export const conversationHref = messageThreadHref;