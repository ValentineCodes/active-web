'use client';

import { useRouter } from '@/lib/navigation';
import { useCallback, useEffect, useRef } from 'react';

import { hasProfilePhotoReady, useMyProfile } from '@/features/profile/api';
import { requestProfileEditLivePhoto } from '@/features/profile/profile-edit-intent';
import {
  ChatSendBlockedByProfilePhotoError,
  isChatSendBlockedByProfilePhoto,
} from '@/features/requests/chat-send-eligibility';

type PendingChatSend = () => void | Promise<void>;

export function useChatSendGate() {
  const router = useRouter();
  const profile = useMyProfile();
  const photoReady = hasProfilePhotoReady(profile.data);
  const pendingSendRef = useRef<PendingChatSend | null>(null);

  useEffect(() => {
    if (photoReady) pendingSendRef.current = null;
  }, [photoReady]);

  const gateChatSend = useCallback(
    async (send: PendingChatSend) => {
      if (photoReady) {
        await send();
        return;
      }
      pendingSendRef.current = send;
      throw new ChatSendBlockedByProfilePhotoError();
    },
    [photoReady],
  );

  const runCapture = useCallback(() => {
    requestProfileEditLivePhoto();
    router.push('/profile/edit');
  }, [router]);

  const resumePendingSend = useCallback(async (): Promise<boolean> => {
    const { data: updatedProfile } = await profile.refetch();
    if (!hasProfilePhotoReady(updatedProfile)) return false;

    const pending = pendingSendRef.current;
    pendingSendRef.current = null;
    if (pending) await pending();
    return true;
  }, [profile]);

  const openCameraSettings = useCallback(() => {
    requestProfileEditLivePhoto();
    router.push('/profile/edit');
  }, [router]);

  return {
    profile,
    photoReady,
    capturePhoto: { isPending: false, isError: false, error: null as Error | null },
    permissionBlocked: false,
    captureButtonLabel: 'Take profile photo',
    gateChatSend,
    runCapture,
    resumePendingSend,
    openCameraSettings,
    isChatSendBlockedByProfilePhoto,
  };
}
