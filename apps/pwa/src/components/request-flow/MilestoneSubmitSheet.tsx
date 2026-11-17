'use client';

import { useEffect, useState } from 'react';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import {
  recordConversationVideo,
  takeConversationPhoto,
  type ConversationPickedAttachment,
} from '@/features/requests/conversation-media';
import { mapConversationAttachmentError } from '@/features/requests/conversation-attachment-policy';
import {
  stageCompletionProofMedia,
  type CompletionProofStagedMedia,
} from '@/features/requests/send-completion-proof-message';
import { showAppToast } from '@/lib/toast';
import { useColors } from '@/theme/ThemeProvider';

type Props = {
  open: boolean;
  busy: boolean;
  milestoneTitle: string;
  milestonePosition: number;
  onClose: () => void;
  onSubmit: (input: { message: string; staged: CompletionProofStagedMedia | null }) => void;
};

export function MilestoneSubmitSheet({
  open,
  busy,
  milestoneTitle,
  milestonePosition,
  onClose,
  onSubmit,
}: Props) {
  const colors = useColors();
  const [message, setMessage] = useState('');
  const [staged, setStaged] = useState<CompletionProofStagedMedia | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!open) {
      setMessage('');
      setStaged(null);
      setCapturing(false);
    }
  }, [open]);

  const addMedia = async (kind: 'image' | 'video') => {
    if (busy || capturing) return;
    setCapturing(true);
    try {
      const picked = kind === 'image' ? await takeConversationPhoto() : await recordConversationVideo();
      if (!picked) return;
      const next = await stageCompletionProofMedia(picked, kind);
      setStaged(next);
    } catch (error) {
      showAppToast(mapConversationAttachmentError(error), 'warning');
    } finally {
      setCapturing(false);
    }
  };

  const handleDismiss = () => {
    if (busy || capturing) return;
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={handleDismiss}
      elevated
      dismissible={!busy && !capturing}
      footer={
        <Button
          label="Submit for approval"
          variant="active"
          size="lg"
          corner="2xl"
          loading={busy}
          onClick={() => onSubmit({ message, staged })}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-ink">Milestone {milestonePosition}</h2>
          <p className="text-base font-semibold text-ink">{milestoneTitle}</p>
        </div>
        <p className="text-sm leading-5 text-muted">
          Optional message and photos post to chat with a [Milestone {milestonePosition}] label.
          You can also submit without them — use chat anytime to discuss changes.
        </p>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-subtle">Message</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={4000}
            disabled={busy}
            placeholder="What you completed for this step…"
            className="min-h-[100px] resize-y rounded-2xl border border-hairline bg-surface px-4 py-3 text-base text-ink"
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-subtle">Photo or video (optional)</span>
          {staged ? (
            <div className="flex flex-col gap-3">
              <div className="overflow-hidden rounded-2xl bg-black">
                {staged.kindHint === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={staged.localFile.uri}
                    alt="Milestone proof"
                    className="max-h-48 w-full object-contain"
                  />
                ) : (
                  <video src={staged.localFile.uri} controls className="max-h-48 w-full" />
                )}
              </div>
              <Button
                label="Remove attachment"
                variant="secondary"
                size="md"
                disabled={busy}
                onClick={() => setStaged(null)}
              />
            </div>
          ) : (
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
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}