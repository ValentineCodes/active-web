import type { RequestMessage } from '@/features/requests/conversation-message-model';

export type SystemMessageTone = 'brand' | 'active' | 'warning' | 'danger' | 'neutral';

export type SystemMessagePresentation = {
  body: string;
  eyebrow: string;
  tone: SystemMessageTone;
};

function lifecycleKeyRaw(metadata: RequestMessage['metadata']): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  const raw = 'lifecycle_key' in metadata ? metadata.lifecycle_key : '';
  return typeof raw === 'string' ? raw : '';
}

function lifecycleEventKey(metadata: RequestMessage['metadata']): string {
  const raw = lifecycleKeyRaw(metadata);
  if (raw.length === 0) return '';
  const colon = raw.lastIndexOf(':');
  return colon >= 0 ? raw.slice(colon + 1) : raw;
}

function lifecycleKeyKind(metadata: RequestMessage['metadata']): string {
  const raw = lifecycleKeyRaw(metadata);
  if (raw.length === 0) return '';
  const colon = raw.indexOf(':');
  return colon >= 0 ? raw.slice(0, colon) : raw;
}

const selectedBodyPattern = /^(.+) was selected to help with this request\.$/;
const completeBodyPattern = /^(.+) marked the request as complete\.$/;
const assignmentWorkDonePattern = /^(.+) says the work is done\.?$/;
const assignmentPaymentReleasedPattern = /^Payment has been released to (.+)\.?$/;

/** Rewrites server timeline copy into second person for the viewer when appropriate. */
export function viewerFacingSystemMessageBody(
  message: Pick<RequestMessage, 'body' | 'metadata' | 'senderId'>,
  viewerUserId: string | null | undefined,
): string {
  const body = message.body.trim();
  if (!viewerUserId) return body;

  const lifecycleKind = lifecycleKeyKind(message.metadata);
  const event = lifecycleEventKey(message.metadata);
  const viewerIsSender = message.senderId === viewerUserId;

  if (event === 'completion_pending' || completeBodyPattern.test(body)) {
    if (viewerIsSender) return 'You marked the request as complete.';
    return body;
  }

  if (lifecycleKind === 'assignment_submitted' || assignmentWorkDonePattern.test(body)) {
    if (viewerIsSender) return 'You say the work is done.';
    return body.endsWith('.') ? body : `${body}.`;
  }

  if (lifecycleKind === 'assignment_payment_released' || assignmentPaymentReleasedPattern.test(body)) {
    const match = body.match(assignmentPaymentReleasedPattern);
    const meta =
      message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
        ? (message.metadata as Record<string, unknown>)
        : null;
    const workerId = typeof meta?.worker_id === 'string' ? meta.worker_id : null;
    if (workerId && viewerUserId === workerId) {
      return 'Payment has been released to you.';
    }
    if (match?.[1]) {
      return `Payment has been released to ${match[1].trim()}.`;
    }
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
  if (assignmentWorkDonePattern.test(body)) return 'assignment_submitted';
  if (assignmentPaymentReleasedPattern.test(body)) return 'assignment_payment_released';
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
  const event = lifecycleKeyKind(message.metadata) || inferEventFromBody(message.body);

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
    case 'assignment_submitted':
      return {
        body,
        eyebrow: body.startsWith('You say') ? 'You updated status' : 'Work marked complete',
        tone: 'active',
      };
    case 'assignment_payment_released':
      return {
        body,
        eyebrow: 'Payment released',
        tone: 'brand',
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