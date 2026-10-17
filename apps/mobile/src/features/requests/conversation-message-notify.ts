import type { RequestMessage } from '@/features/requests/conversation-message-model';

/** Mirrors `new_message_notification_body` for in-thread toasts. */
export function incomingMessageToastLine(senderLabel: string, message: RequestMessage): string {
  const first = senderLabel.trim() || 'Someone';
  const body = message.body.trim();

  if (body.length > 0) {
    return `${first} sent you a message.`;
  }

  const attachments = message.attachments;
  if (attachments.length === 0) {
    return `${first} sent you a message.`;
  }

  const hasImage = attachments.some((a) => a.attachmentType === 'image');
  const hasVideo = attachments.some((a) => a.attachmentType === 'video');
  const hasFile = attachments.some((a) => a.attachmentType === 'file');

  if (hasImage && !hasVideo && !hasFile) {
    return `${first} sent you a photo.`;
  }
  if (hasVideo && !hasImage && !hasFile) {
    return `${first} sent you a video.`;
  }
  if (hasFile && !hasImage && !hasVideo) {
    return `${first} sent you a file.`;
  }

  return `${first} sent you a message.`;
}
