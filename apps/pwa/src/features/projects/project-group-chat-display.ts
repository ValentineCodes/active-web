const DEFAULT_MEMBER_LINE_MAX_CHARS = 56;

export function groupMemberLineLabels(
  members: readonly { user_id: string; display_name: string | null }[],
  viewerUserId: string | undefined,
): string[] {
  return members.map((row) => {
    if (viewerUserId && row.user_id === viewerUserId) return 'You';
    return row.display_name?.trim() ?? '';
  });
}

/** Comma-separated member list with "..." when over the character budget (WhatsApp-style subtitle). */
export function formatGroupMemberNames(
  names: readonly string[],
  maxChars = DEFAULT_MEMBER_LINE_MAX_CHARS,
): string {
  const cleaned = names.map((name) => name.trim()).filter((name) => name.length > 0);
  if (cleaned.length === 0) return '';

  const line = cleaned.join(', ');
  if (line.length <= maxChars) return line;

  const slice = line.slice(0, maxChars);
  const lastComma = slice.lastIndexOf(', ');
  const trimmed =
    lastComma > maxChars * 0.35 ? slice.slice(0, lastComma) : slice.trimEnd().replace(/,$/, '');

  return `${trimmed}...`;
}

export function isProjectGroupConversation(counterpartyDisplayName: string | null): boolean {
  return counterpartyDisplayName?.trim() === 'Project team';
}