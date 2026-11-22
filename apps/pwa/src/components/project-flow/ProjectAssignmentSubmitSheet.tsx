'use client';

import { useEffect, useRef, useState } from 'react';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { mapConversationAttachmentError } from '@/features/requests/conversation-attachment-policy';
import {
  pickConversationPhotosFromLibrary,
  recordConversationVideo,
  takeConversationPhoto,
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
import { useColors } from '@/theme/ThemeProvider';

const MAX_ATTACHMENTS = 10;
const PREVIEW_SIZE_PX = 96;

function isVisualMedia(item: ProjectAssignmentSubmissionStagedMedia): boolean {
  return item.kindHint === 'image' || item.kindHint === 'video';
}

export function ProjectAssignmentSubmitSheet({
  open,
  assignmentId,
  milestoneId,
  assignmentTitle: _assignmentTitle,
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
  const colors = useColors();
  const [note, setNote] = useState('');
  const [staged, setStaged] = useState<ProjectAssignmentSubmissionStagedMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [progress, setProgress] = useState(0);
  const sessionRef = useRef(createProjectAssignmentSubmissionSendSession());

  const visualStaged = staged.filter(isVisualMedia);
  const canAddMore = staged.length < MAX_ATTACHMENTS;

  useEffect(() => {
    if (!open) {
      setNote('');
      setStaged([]);
      setBusy(false);
      setCapturing(false);
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

  const addStaged = async (files: ConversationPickedAttachment[], kind: 'image' | 'video') => {
    const next: ProjectAssignmentSubmissionStagedMedia[] = [];
    for (const file of files) {
      next.push(await stageProjectAssignmentSubmissionMedia(file, kind));
    }
    setStaged((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS));
  };

  const addMedia = async (kind: 'image' | 'video') => {
    if (busy || capturing || staged.length >= MAX_ATTACHMENTS) return;
    setCapturing(true);
    try {
      const picked = kind === 'image' ? await takeConversationPhoto() : await recordConversationVideo();
      if (!picked) return;
      await addStaged([picked], kind);
    } catch (error) {
      showAppToast(mapConversationAttachmentError(error), 'warning');
    } finally {
      setCapturing(false);
    }
  };

  const removeAt = (index: number) => {
    setStaged((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const dismiss = () => {
    if (busy || capturing) return;
    void abortProjectAssignmentSubmissionSendSession(sessionRef.current).finally(onClose);
  };

  const confirmSend = async () => {
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
      showAppToast('Submitted', { type: 'success' });
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
    <BottomSheet
      open={open}
      title="Submit"
      onClose={dismiss}
      elevated
      dismissible={!busy && !capturing}
      footer={
        <Button
          label={busy ? 'Submitting…' : 'Submit'}
          variant="active"
          size="lg"
          corner="2xl"
          loading={busy}
          onClick={() => void confirmSend()}
        />
      }
    >
      <div className="flex flex-col gap-4 px-5 pb-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-subtle">Message</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            maxLength={2000}
            disabled={busy}
            placeholder="What you completed…"
            className="min-h-[100px] resize-y rounded-2xl border border-hairline bg-surface px-4 py-3 text-base text-ink"
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-subtle">Photo or video (optional)</span>

          {visualStaged.length > 0 ? (
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {staged.map((item, index) => {
                if (!isVisualMedia(item)) return null;
                return (
                  <div
                    key={`${item.prepared.fileName}-${index}`}
                    className="relative shrink-0 overflow-hidden rounded-2xl bg-black"
                    style={{ width: PREVIEW_SIZE_PX, height: PREVIEW_SIZE_PX }}
                  >
                    {item.kindHint === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.localFile.uri}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <video
                        src={item.localFile.uri}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                      />
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      aria-label="Remove attachment"
                      onClick={() => removeAt(index)}
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-canvas/90 active:opacity-80"
                    >
                      <IonIcon icon={ionIcons['close']} size={16} color={colors.ink} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}

          {capturing ? (
            <p className="py-2 text-center text-sm text-muted">Opening camera…</p>
          ) : canAddMore ? (
            <div className="flex flex-row gap-3">
              <button
                type="button"
                disabled={busy || capturing}
                onClick={() => void addMedia('image')}
                className="flex flex-1 flex-col items-center gap-2 rounded-2xl border border-hairline bg-surface px-3 py-4 active:opacity-80 disabled:opacity-45"
              >
                <IonIcon icon={ionIcons['camera-outline']} size={22} color={colors.active} />
                <span className="text-sm font-semibold text-ink">Photo</span>
              </button>
              <button
                type="button"
                disabled={busy || capturing}
                onClick={() => void addMedia('video')}
                className="flex flex-1 flex-col items-center gap-2 rounded-2xl border border-hairline bg-surface px-3 py-4 active:opacity-80 disabled:opacity-45"
              >
                <IonIcon icon={ionIcons['videocam-outline']} size={22} color={colors.active} />
                <span className="text-sm font-semibold text-ink">Video</span>
              </button>
              <button
                type="button"
                disabled={busy || capturing}
                onClick={() =>
                  void pickConversationPhotosFromLibrary(MAX_ATTACHMENTS - staged.length).then((files) =>
                    void addStaged(files, 'image'),
                  )
                }
                className="flex flex-1 flex-col items-center gap-2 rounded-2xl border border-hairline bg-surface px-3 py-4 active:opacity-80 disabled:opacity-45"
              >
                <IonIcon icon={ionIcons['images-outline']} size={22} color={colors.active} />
                <span className="text-sm font-semibold text-ink">Gallery</span>
              </button>
            </div>
          ) : null}
        </div>

        {busy && staged.length > 0 ? (
          <p className="text-center text-sm text-muted">
            Uploading… {Math.round(progress * 100)}%
          </p>
        ) : null}
      </div>
    </BottomSheet>
  );
}