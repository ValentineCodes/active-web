'use client';

import { AttachmentMessageBubble } from '@/components/conversation/AttachmentMessageBubble';
import { Badge } from '@/components/ui/Badge';
import type { RequestMessage } from '@/features/requests/conversation-message-model';
import {
  parseProjectAssignmentSubmissionMetadata,
  projectAssignmentSubmissionChatBadgeLabel,
  projectAssignmentSubmissionDisplayNote,
} from '@/features/projects/project-assignment-submission-message';
import type { ConversationAttachmentUploadState } from '@/features/requests/conversation-attachment-upload-state';

export function ProjectAssignmentSubmissionMessageBubble({
  message,
  isOutgoing,
  uploadStateByAttachmentId,
}: {
  message: RequestMessage;
  isOutgoing: boolean;
  uploadStateByAttachmentId?: Record<string, ConversationAttachmentUploadState>;
}) {
  const meta = parseProjectAssignmentSubmissionMetadata(message.metadata);
  if (!meta) return null;

  const badgeLabel = projectAssignmentSubmissionChatBadgeLabel(meta.review_state);
  const badgeTone =
    meta.review_state === 'approved_paid' || meta.review_state === 'milestone_paid'
      ? 'active'
      : 'brand';

  return (
    <div className="flex w-max max-w-full flex-col gap-2">
      <div className="w-fit shrink-0 rounded-2xl border border-hairline bg-surface px-4 py-3">
        <Badge label={badgeLabel} tone={badgeTone} dot={false} nowrap />
      </div>
      <AttachmentMessageBubble
        message={{ ...message, body: projectAssignmentSubmissionDisplayNote(message.body) }}
        isOutgoing={isOutgoing}
        uploadStateByAttachmentId={uploadStateByAttachmentId}
      />
    </div>
  );
}