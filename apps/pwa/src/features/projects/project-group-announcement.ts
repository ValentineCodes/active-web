import type { RequestMessage } from '@/features/requests/conversation-message-model';

export function isProjectGroupAnnouncementMessage(message: RequestMessage): boolean {
  if (message.messageType !== 'system') return false;
  const meta = message.metadata;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  return (meta as Record<string, unknown>).event === 'project_assignment_lifecycle';
}