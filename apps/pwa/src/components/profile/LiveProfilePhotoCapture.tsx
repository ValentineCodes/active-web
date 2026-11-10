'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { InlineError } from '@/components/ui/StateView';
import {
  captureFrameFromVideo,
  openUserFacingCameraStream,
  uploadLiveProfilePhoto,
} from '@/features/profile/capture-live-profile-photo';

type Props = {
  userId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function LiveProfilePhotoCapture({ userId, onClose, onSaved }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const stream = await openUserFacingCameraStream();
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not open the camera.');
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video) return;
    setSaving(true);
    setError(null);
    try {
      const bytes = await captureFrameFromVideo(video);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      await uploadLiveProfilePhoto(userId, bytes);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the photo.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      <div className="border-b border-hairline px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <h2 className="text-base font-semibold text-ink">Take profile photo</h2>
        <p className="mt-1 text-sm text-muted">
          Use your front camera. Gallery uploads do not count toward your profile photo.
        </p>
      </div>

      <div className="relative flex flex-1 items-center justify-center bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="max-h-full max-w-full object-contain"
          aria-label="Camera preview"
        />
        {!ready && !error ? (
          <p className="absolute text-sm text-on-brand">Starting camera…</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-hairline px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error ? <InlineError message={error} /> : null}
        <Button label="Capture photo" onClick={() => void handleCapture()} loading={saving} disabled={!ready} />
        <Button label="Cancel" variant="secondary" onClick={onClose} disabled={saving} />
      </div>
    </div>
  );
}
