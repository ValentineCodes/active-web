/**
 * Chat send eligibility (in-app profile photo).
 *
 * All message sends in the mobile app go through `app/conversation/[id].tsx` and
 * `useChatSendGate`. Navigation-only entry points (request discuss, engagement chat,
 * respond discuss, notification deep links) open the thread for reading without gating.
 *
 * Server enforcement: `assert_in_app_profile_photo` on `send_request_message`,
 * `begin_request_message_with_attachments`, `complete_request_message_with_attachments`,
 * and the `request_messages` insert trigger (`guard_request_message_columns`).
 */

export function hasProfilePhotoReady(
  profile:
    | {
        avatar_path: string | null;
        avatar_captured_in_app: boolean;
      }
    | null
    | undefined,
) {
  return Boolean(profile?.avatar_path && profile.avatar_captured_in_app);
}

export class ChatSendBlockedByProfilePhotoError extends Error {
  constructor() {
    super('Profile photo is required before you can send messages.');
    this.name = 'ChatSendBlockedByProfilePhotoError';
  }
}

export function isChatSendBlockedByProfilePhoto(error: unknown): boolean {
  return (
    error instanceof ChatSendBlockedByProfilePhotoError ||
    isServerChatProfilePhotoRequiredError(error)
  );
}

/** Matches `assert_in_app_profile_photo` (SQLSTATE 55000). */
export const SERVER_CHAT_PROFILE_PHOTO_REQUIRED_MESSAGE =
  'add a profile photo in the app before messaging';

export function isServerChatProfilePhotoRequiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error) || !('message' in error)) {
    return false;
  }
  const { code, message } = error as { code: unknown; message: unknown };
  return (
    code === '55000' &&
    typeof message === 'string' &&
    message === SERVER_CHAT_PROFILE_PHOTO_REQUIRED_MESSAGE
  );
}
