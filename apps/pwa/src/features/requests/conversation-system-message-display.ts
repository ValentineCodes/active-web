import type { RequestMessage } from '@/features/requests/conversation-message-model';

export type SystemMessageTone = 'brand' | 'active' | 'warning' | 'danger' | 'neutral';

export type SystemMessagePresentation = {
  body: string;
  eyebrow: string;
  tone: SystemMessageTone;
};

function lifecycleEventKey(metadata: RequestMessage['metadata']): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  const raw = 'lifecycle_key' in metadata ? metadata.lifecycle_key : '';
  if (typeof raw !== 'string' || raw.length === 0) return '';
  const colon = raw.lastIndexOf(':');
  return colon >= 0 ? raw.slice(colon + 1) : raw;
}

const selectedBodyPattern = /^(.+) was selected to help with this request\.$/;
const completeBodyPattern = /^(.+) marked the request as complete\.$/;

/** Rewrites server timeline copy into second person for the viewer when appropriate. */
export function viewerFacingSystemMessageBody(
  message: Pick<RequestMessage, 'body' | 'metadata' | 'senderId'>,
  viewerUserId: string | null | undefined,
): string {
  const body = message.body.trim();
  if (!viewerUserId) return body;

  const event = lifecycleEventKey(message.metadata);
  const viewerIsSender = message.senderId === viewerUserId;

  if (event === 'completion_pending' || completeBodyPattern.test(body)) {
    if (viewerIsSender) return 'You marked the request as complete.';
    return body;
  }

  if (event === 'selected' || selectedBodyPattern.test(body)) {
    if (viewerIsSender) {
      const match = body.match(selectedBodyPattern);
      const name = match?.[1]?.trim();
      return name
        ? `You selected ${name} to help with this request.`
        : 'You selected them to help with this request.';
    }
    return "You've been selected to help with this request.";
  }

  return body;
}

function inferEventFromBody(body: string): string {
  if (selectedBodyPattern.test(body)) return 'selected';
  if (completeBodyPattern.test(body)) return 'completion_pending';
  if (/payment has been secured/i.test(body)) return 'payment_secured';
  if (/problem was reported/i.test(body)) return 'disputed';
  if (/was cancelled/i.test(body)) return 'cancelled';
  if (/expired/i.test(body)) return 'expired';
  return 'neutral';
}

export function systemMessagePresentation(
  message: Pick<RequestMessage, 'body' | 'metadata' | 'senderId'>,
  viewerUserId: string | null | undefined,
): SystemMessagePresentation {
  const body = viewerFacingSystemMessageBody(message, viewerUserId);
  const event = lifecycleEventKey(message.metadata) || inferEventFromBody(message.body);

  switch (event) {
    case 'selected':
      return {
        body,
        eyebrow: body.startsWith("You've") ? "You're in" : 'Helper chosen',
        tone: 'brand',
      };
    case 'completion_pending':
      return {
        body,
        eyebrow: body.startsWith('You marked') ? 'You updated status' : 'Work marked complete',
        tone: 'active',
      };
    case 'payment_secured':
      return { body, eyebrow: 'Payment secured', tone: 'brand' };
    case 'disputed':
      return { body, eyebrow: 'Issue reported', tone: 'danger' };
    case 'cancelled':
    case 'expired':
      return { body, eyebrow: 'Request closed', tone: 'warning' };
    default:
      return { body, eyebrow: 'Update', tone: 'neutral' };
  }
}