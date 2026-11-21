'use client';

import { useEffect, useRef, useState } from 'react';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/TextField';
import {
  chooseConversationFile,
  pickConversationPhotosFromLibrary,
  type ConversationPickedAttachment,
} from '@/features/requests/conversation-media';
import {
  abortProjectAssignmentSubmissionSendSession,
  createProjectAssignmentSubmissionSendSession,
  sendProjectAssignmentSubmission,
  stageProjectAssignmentSubmissionMedia,
  type ProjectAssignmentSubmissionStagedMedia,
} from '@/features/projects/send-project-assignment-submission';
import { showAppToast } from '@/lib/toast';
import { supabase } from '@/lib/supabase/client';

export function ProjectAssignmentSubmitSheet({
  open,
  assignmentId,
  milestoneId,
  assignmentTitle,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  assignmentId: string;
  milestoneId?: string | null;
  assignmentTitle: string;
  onClose: () => void;
  onSubmitted: (result: { submissionId: string; conversationId: string | null }) => void;
}) {
  const [note, setNote] = useState('');
  const [staged, setStaged] = useState<ProjectAssignmentSubmissionStagedMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const sessionRef = useRef(createProjectAssignmentSubmissionSendSession());

  useEffect(() => {
    if (!open) {
      setNote('');
      setStaged([]);
      setBusy(false);
      setProgress(0);
      sessionRef.current = createProjectAssignmentSubmissionSendSession();
      return;
    }
    sessionRef.current = createProjectAssignmentSubmissionSendSession();
    void supabase.rpc('discard_project_assignment_submission_drafts', {
      p_assignment_id: assignmentId,
      p_milestone_id: milestoneId ?? undefined,
    });
  }, [open, assignmentId, milestoneId]);

  const addFiles = async (files: ConversationPickedAttachment[], kind: 'image' | 'file') => {
    const next: ProjectAssignmentSubmissionStagedMedia[] = [];
    for (const file of files) {
      next.push(await stageProjectAssignmentSubmissionMedia(file, kind === 'image' ? 'image' : 'file'));
    }
    setStaged((prev) => [...prev, ...next].slice(0, 10));
  };

  const dismiss = () => {
    void abortProjectAssignmentSubmissionSendSession(sessionRef.current).finally(onClose);
  };

  const confirmSend = async () => {
    if (staged.length < 1 && !note.trim()) {
      showAppToast('Add a message or at least one file.', 'warning');
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const result = await sendProjectAssignmentSubmission({
        assignmentId,
        milestoneId,
        note: note.trim() || undefined,
        stagedItems: staged,
        session: sessionRef.current,
        onUploadProgress: setProgress,
      });
      sessionRef.current = result.session;
      showAppToast('Deliverables submitted to project chat', {
        type: 'success',
        title: 'Submitted',
      });
      onSubmitted({
        submissionId: result.submissionId,
        conversationId: result.session.conversationId,
      });
      onClose();
    } catch (error) {
      showAppToast(error instanceof Error ? error.message : 'Could not submit', {
        type: 'danger',
        title: 'Could not submit',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={dismiss} title="Submit deliverables">
      <div className="flex flex-col gap-4 px-5 pb-8">
        <p className="text-sm text-muted">
          Files and proof will post to the shared project team chat for <strong>{assignmentTitle}</strong>.
          Ordinary chat messages are not formal submissions.
        </p>

        <div className="flex flex-row gap-2">
          <Button
            label="Add photos"
            variant="secondary"
            className="flex-1"
            disabled={busy}
            onClick={() =>
              void pickConversationPhotosFromLibrary(10).then((files) => void addFiles(files, 'image'))
            }
          />
          <Button
            label="Add files"
            variant="secondary"
            className="flex-1"
            disabled={busy}
            onClick={() =>
              void chooseConversationFile().then((file) => {
                if (file) void addFiles([file], 'file');
              })
            }
          />
        </div>

        {staged.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-xl bg-surface p-3">
            {staged.map((item, index) => (
              <li key={`${item.prepared.fileName}-${index}`} className="text-sm text-ink">
                {item.prepared.fileName}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No files selected yet.</p>
        )}

        <TextAreaField
          label="Message (optional with files)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Describe what you delivered"
        />

        {busy ? (
          <p className="text-center text-sm text-muted">
            {staged.length > 0
              ? `Uploading… ${Math.round(progress * 100)}%`
              : 'Submitting…'}
          </p>
        ) : null}

        <Button
          label={busy ? 'Submitting…' : 'Submit'}
          size="lg"
          corner="2xl"
          loading={busy}
          disabled={staged.length < 1 && !note.trim()}
          onClick={() => void confirmSend()}
        />
      </div>
    </BottomSheet>
  );
}