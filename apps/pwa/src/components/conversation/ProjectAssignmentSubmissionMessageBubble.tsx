'use client';

import { AttachmentMessageBubble } from '@/components/conversation/AttachmentMessageBubble';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { RequestMessage } from '@/features/requests/conversation-message-model';
import {
  parseProjectAssignmentSubmissionMetadata,
  projectAssignmentSubmissionReviewLabel,
} from '@/features/projects/project-assignment-submission-message';
import type { ConversationAttachmentUploadState } from '@/features/requests/conversation-attachment-upload-state';
import { useRouter } from '@/lib/navigation';

export function ProjectAssignmentSubmissionMessageBubble({
  message,
  isOutgoing,
  uploadStateByAttachmentId,
}: {
  message: RequestMessage;
  isOutgoing: boolean;
  uploadStateByAttachmentId?: Record<string, ConversationAttachmentUploadState>;
}) {
  const router = useRouter();
  const meta = parseProjectAssignmentSubmissionMetadata(message.metadata);
  if (!meta) return null;

  const reviewLabel = projectAssignmentSubmissionReviewLabel(meta.review_state);
  const reviewTone =
    meta.review_state === 'approved_paid' || meta.review_state === 'milestone_paid'
      ? 'active'
      : 'warning';

  const assignmentHref = `/project/${meta.project_id}/assignment/${meta.assignment_id}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex max-w-[92%] flex-col gap-2 self-center rounded-2xl border border-hairline bg-surface px-4 py-3">
        <div className="flex flex-row flex-wrap items-center gap-2">
          <Badge label="Assignment submission" tone="brand" />
          <Badge label={reviewLabel} tone={reviewTone} />
        </div>
        <p className="text-sm font-semibold text-ink">
          {meta.assignment_title ?? 'Project assignment'}
          {meta.milestone_title ? ` · ${meta.milestone_title}` : ''}
        </p>
        {message.body.trim() ? <p className="text-sm text-ink">{message.body.trim()}</p> : null}
        {!isOutgoing ? (
          <Button
            label="Review assignment"
            variant="secondary"
            size="md"
            onClick={() => router.push(assignmentHref)}
          />
        ) : null}
      </div>
      <AttachmentMessageBubble
        message={message}
        isOutgoing={isOutgoing}
        uploadStateByAttachmentId={uploadStateByAttachmentId}
      />
    </div>
  );
}