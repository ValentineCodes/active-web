import { isSameDay } from 'date-fns';

import type { RequestMessage } from '@/features/requests/conversation-message-model';

/** `messages` is newest-first (inverted list data order). */
export function shouldShowChatDaySeparator(messages: RequestMessage[], index: number): boolean {
  if (messages.length === 0) return false;
  if (index === messages.length - 1) return true;
  if (index === 0) return false;

  const currentMsg = messages[index];
  const newerMsg = messages[index - 1];
  if (!currentMsg || !newerMsg) return false;
  const current = new Date(currentMsg.createdAt);
  const newer = new Date(newerMsg.createdAt);
  if (Number.isNaN(current.getTime()) || Number.isNaN(newer.getTime())) return false;

  return !isSameDay(current, newer);
}
