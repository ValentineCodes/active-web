import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { hasProfilePhotoReady, useMyProfile } from '@/features/profile/api';
import {
  ChatSendBlockedByProfilePhotoError,
  isChatSendBlockedByProfilePhoto,
} from '@/features/requests/chat-send-eligibility';

type PendingChatSend = () => void | Promise<void>;

export function useChatSendGate() {
  const navigate = useNavigate();
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
    navigate('/profile/edit', { state: { openLivePhoto: true } });
  }, [navigate]);

  const openCameraSettings = useCallback(() => {
    navigate('/profile/edit', { state: { openLivePhoto: true } });
  }, [navigate]);

  return {
    profile,
    photoReady,
    capturePhoto: { isPending: false, mutateAsync: async () => false },
    permissionBlocked: false,
    captureButtonLabel: 'Take profile photo',
    gateChatSend,
    runCapture,
    openCameraSettings,
    isChatSendBlockedByProfilePhoto,
  };
}
