import { assertLiveCameraProfilePhotoSource } from '@/features/profile/profile-photo-policy';
import {
  cameraEnvironmentErrorMessage,
  evaluateCameraEnvironment,
} from '@/features/profile/camera-environment';
import { AVATAR_BUCKET, uploadPrivateObject } from '@/features/profile/storage';
import { supabase } from '@/lib/supabase/client';

export type LiveProfilePhotoOutcome =
  | { kind: 'saved' }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

function canvasToJpegBytes(canvas: HTMLCanvasElement, quality = 0.72): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('The photo could not be encoded.'));
          return;
        }
        void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)));
      },
      'image/jpeg',
      quality,
    );
  });
}

export async function captureFrameFromVideo(video: HTMLVideoElement): Promise<Uint8Array> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    throw new Error('The camera feed is not ready. Wait a moment and try again.');
  }

  const side = Math.min(width, height);
  const sx = Math.floor((width - side) / 2);
  const sy = Math.floor((height - side) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the photo.');
  ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side);
  return canvasToJpegBytes(canvas);
}

export async function openUserFacingCameraStream(): Promise<MediaStream> {
  const env = evaluateCameraEnvironment(
    typeof navigator.mediaDevices?.getUserMedia === 'function',
    window.isSecureContext,
  );
  if (!env.ok) {
    throw new Error(cameraEnvironmentErrorMessage(env));
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'user' } },
      audio: false,
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      throw new Error(
        'Camera access was denied. Allow camera permission in your browser settings, then try again.',
      );
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      throw new Error('No camera was found on this device.');
    }
    throw error instanceof Error ? error : new Error('Could not open the camera.');
  }
}

/**
 * Live camera capture only — must not be used for gallery/file uploads.
 */
export async function uploadLiveProfilePhoto(userId: string, jpegBytes: Uint8Array): Promise<void> {
  assertLiveCameraProfilePhotoSource('live_camera');

  const path = `${userId}/avatar.jpg`;
  await uploadPrivateObject(AVATAR_BUCKET, path, jpegBytes, 'image/jpeg', undefined, { upsert: true });

  const { error } = await supabase.rpc('confirm_avatar_capture', { p_storage_path: path });
  if (error) throw error;
}
