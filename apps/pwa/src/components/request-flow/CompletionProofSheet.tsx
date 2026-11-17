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
import type { CompletionProofStagedMedia } from '@/features/requests/send-completion-proof-message';
import { showAppToast } from '@/lib/toast';
import { useColors } from '@/theme/ThemeProvider';

export type CompletionProofFailure = {
  phase: 'upload' | 'send';
  message: string;
};

type SheetStep = 'pickKind' | 'preview';

function MediaKindRow({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: keyof typeof ionIcons;
  onClick: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full flex-row items-center gap-4 rounded-2xl py-3 text-left active:opacity-80 disabled:opacity-45"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-active-soft">
        <IonIcon icon={ionIcons[icon]} size={22} color={colors.active} />
      </span>
      <span className="text-base font-semibold text-ink">{label}</span>
    </button>
  );
}

export function CompletionProofSheet({
  open,
  onClose,
  busy,
  failure,
  onSkip,
  onSendProof,
  onStageMedia,
  onDiscardPreview,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  failure: CompletionProofFailure | null;
  onSkip: () => void;
  onSendProof: (staged: CompletionProofStagedMedia) => void | Promise<void>;
  onStageMedia: (
    localFile: ConversationPickedAttachment,
    kindHint: 'image' | 'video',
  ) => Promise<CompletionProofStagedMedia>;
  onDiscardPreview: () => void;
}) {
  const [step, setStep] = useState<SheetStep>('pickKind');
  const [staged, setStaged] = useState<CompletionProofStagedMedia | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep('pickKind');
      setStaged(null);
      setCapturing(false);
    }
  }, [open]);

  const runCapture = async (kind: 'image' | 'video') => {
    if (busy || capturing) return;
    setCapturing(true);
    try {
      const picked = kind === 'image' ? await takeConversationPhoto() : await recordConversationVideo();
      if (!picked) return;
      const next = await onStageMedia(picked, kind);
      setStaged(next);
      setStep('preview');
    } catch (error) {
      showAppToast(mapConversationAttachmentError(error), { type: 'warning' });
    } finally {
      setCapturing(false);
    }
  };

  const discardPreview = () => {
    if (busy) return;
    setStaged(null);
    setStep('pickKind');
    onDiscardPreview();
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
        step === 'preview' && staged ? (
          <div className="flex flex-row gap-3">
            <Button
              label="Choose again"
              variant="secondary"
              size="lg"
              corner="2xl"
              className="min-w-0 flex-1"
              disabled={busy}
              onClick={discardPreview}
            />
            <Button
              label="Send proof"
              variant="active"
              size="lg"
              corner="2xl"
              className="min-w-0 flex-1"
              loading={busy}
              onClick={() => void onSendProof(staged)}
            />
          </div>
        ) : undefined
      }
    >
      {step === 'pickKind' ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold text-ink">Prove it!</h2>
            <p className="text-base text-muted">Show the requester the work you&apos;ve done.</p>
          </div>

          {capturing ? (
            <p className="py-6 text-center text-sm text-muted">Opening camera…</p>
          ) : (
            <div className="flex flex-col gap-1">
              <MediaKindRow
                icon="camera-outline"
                label="Take photo"
                disabled={busy}
                onClick={() => void runCapture('image')}
              />
              <MediaKindRow
                icon="videocam-outline"
                label="Record video"
                disabled={busy}
                onClick={() => void runCapture('video')}
              />
            </div>
          )}

          <Button
            label="Skip for now"
            variant="secondary"
            size="lg"
            disabled={busy || capturing}
            onClick={() => {
              if (busy || capturing) return;
              onSkip();
            }}
          />
        </div>
      ) : null}

      {step === 'preview' && staged ? (
        <div className="flex flex-col gap-5">
          <h2 className="text-xl font-bold text-ink">Preview</h2>

          {failure ? (
            <div className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3">
              <p className="text-sm font-semibold text-danger">
                {failure.phase === 'upload' ? 'Upload failed' : 'Could not send message'}
              </p>
              <p className="mt-1 text-sm text-muted">{failure.message}</p>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl bg-black">
            {staged.kindHint === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={staged.localFile.uri}
                alt="Completion proof"
                className="max-h-72 w-full object-contain"
              />
            ) : (
              <video src={staged.localFile.uri} controls className="max-h-72 w-full" />
            )}
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}