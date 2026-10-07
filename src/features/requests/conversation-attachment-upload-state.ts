export type ConversationAttachmentUploadPhase =
  'idle' | 'preparing' | 'uploading' | 'uploaded' | 'failed' | 'retrying' | 'cancelled';

export type ConversationAttachmentUploadState = {
  phase: ConversationAttachmentUploadPhase;
  /** 0–1 while phase is uploading */
  progress?: number;
  errorMessage?: string;
};

export class ConversationUploadCancelledError extends Error {
  constructor() {
    super('Upload cancelled.');
    this.name = 'ConversationUploadCancelledError';
  }
}

export class ConversationAttachmentUploadFailedError extends Error {
  failedAttachmentId: string;

  constructor(failedAttachmentId: string, message: string) {
    super(message);
    this.name = 'ConversationAttachmentUploadFailedError';
    this.failedAttachmentId = failedAttachmentId;
  }
}

export function isConversationUploadCancelledError(
  error: unknown,
): error is ConversationUploadCancelledError {
  return error instanceof ConversationUploadCancelledError;
}

export function isConversationAttachmentUploadFailedError(
  error: unknown,
): error is ConversationAttachmentUploadFailedError {
  return error instanceof ConversationAttachmentUploadFailedError;
}

export function uploadPhaseLabel(phase: ConversationAttachmentUploadPhase): string | null {
  switch (phase) {
    case 'preparing':
      return 'Preparing…';
    case 'uploading':
      return 'Uploading…';
    case 'uploaded':
      return 'Uploaded';
    case 'failed':
      return 'Could not send';
    case 'retrying':
      return 'Retrying…';
    case 'cancelled':
      return 'Cancelled';
    default:
      return null;
  }
}

export function initialUploadStates(
  attachmentIds: string[],
  phase: ConversationAttachmentUploadPhase = 'preparing',
): Record<string, ConversationAttachmentUploadState> {
  const states: Record<string, ConversationAttachmentUploadState> = {};
  for (const id of attachmentIds) {
    states[id] = { phase };
  }
  return states;
}
