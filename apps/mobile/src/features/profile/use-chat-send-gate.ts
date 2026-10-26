import { useCallback, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { getProfilePhotoCameraPermission } from '@/features/profile/capture-profile-photo';
import {
  ChatSendBlockedByProfilePhotoError,
  hasProfilePhotoReady,
  isChatSendBlockedByProfilePhoto,
} from '@/features/requests/chat-send-eligibility';
import { useCaptureProfilePhoto, useProfile } from '@/features/profile/api';

type PendingChatSend = () => void | Promise<void>;

/**
 * Gates chat message sends behind the shared in-app profile photo capture flow.
 * Use `gateChatSend` for every send path (text, attachments, retries).
 */
export function useChatSendGate() {
  const profile = useProfile();
  const capturePhoto = useCaptureProfilePhoto();
  const photoReady = hasProfilePhotoReady(profile.data);
  const pendingSendRef = useRef<PendingChatSend | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  const syncPermissionBlocked = useCallback(async () => {
    const permission = await getProfilePhotoCameraPermission();
    setPermissionBlocked(!permission.granted && !permission.canAskAgain);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (photoReady) return;
      void syncPermissionBlocked();
    }, [photoReady, syncPermissionBlocked]),
  );

  const resumePendingSend = useCallback(async (): Promise<boolean> => {
    const { data: updatedProfile } = await profile.refetch();
    if (!hasProfilePhotoReady(updatedProfile)) return false;

    const pending = pendingSendRef.current;
    pendingSendRef.current = null;
    if (pending) {
      await pending();
    }
    return true;
  }, [profile]);

  const runProfilePhotoCapture = useCallback(
    async ({ forComposerSend }: { forComposerSend: boolean }) => {
      if (photoReady) {
        return true;
      }

      try {
        const saved = await capturePhoto.mutateAsync({});
        if (!saved) {
          if (forComposerSend) {
            pendingSendRef.current = null;
            throw new ChatSendBlockedByProfilePhotoError();
          }
          return false;
        }

        const resumed = await resumePendingSend();
        if (forComposerSend && !resumed) {
          throw new ChatSendBlockedByProfilePhotoError();
        }
        return true;
      } catch (error) {
        if (forComposerSend && isChatSendBlockedByProfilePhoto(error)) {
          throw error;
        }
        if (!forComposerSend) {
          await syncPermissionBlocked();
          return false;
        }
        pendingSendRef.current = null;
        await syncPermissionBlocked();
        throw new ChatSendBlockedByProfilePhotoError();
      }
    },
    [capturePhoto, photoReady, resumePendingSend, syncPermissionBlocked],
  );

  const gateChatSend = useCallback(
    async (send: PendingChatSend) => {
      if (photoReady) {
        await send();
        return;
      }

      pendingSendRef.current = send;
      await runProfilePhotoCapture({ forComposerSend: true });
    },
    [photoReady, runProfilePhotoCapture],
  );

  const runCapture = useCallback(async () => {
    if (photoReady) return;
    await runProfilePhotoCapture({ forComposerSend: false });
  }, [photoReady, runProfilePhotoCapture]);

  const openCameraSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const captureButtonLabel = permissionBlocked
    ? 'Open settings'
    : capturePhoto.isPending
      ? 'Opening camera…'
      : 'Take profile photo';

  return {
    profile,
    photoReady,
    capturePhoto,
    permissionBlocked,
    captureButtonLabel,
    gateChatSend,
    runCapture,
    openCameraSettings,
  };
}
