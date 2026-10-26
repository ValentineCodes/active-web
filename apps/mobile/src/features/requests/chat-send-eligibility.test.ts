import assert from 'node:assert/strict';

import {
  ChatSendBlockedByProfilePhotoError,
  hasProfilePhotoReady,
  isChatSendBlockedByProfilePhoto,
  isServerChatProfilePhotoRequiredError,
  SERVER_CHAT_PROFILE_PHOTO_REQUIRED_MESSAGE,
} from './chat-send-eligibility.ts';

assert.equal(hasProfilePhotoReady(null), false);
assert.equal(
  hasProfilePhotoReady({ avatar_path: 'user/avatar.jpg', avatar_captured_in_app: false }),
  false,
);
assert.equal(
  hasProfilePhotoReady({ avatar_path: 'user/avatar.jpg', avatar_captured_in_app: true }),
  true,
);

assert.equal(
  isServerChatProfilePhotoRequiredError({
    code: '55000',
    message: SERVER_CHAT_PROFILE_PHOTO_REQUIRED_MESSAGE,
  }),
  true,
);
assert.equal(
  isServerChatProfilePhotoRequiredError({
    code: '55000',
    message: 'add a profile photo in the app before responding',
  }),
  false,
  'respond eligibility uses a distinct server message',
);
assert.equal(
  isServerChatProfilePhotoRequiredError({
    code: '42501',
    message: SERVER_CHAT_PROFILE_PHOTO_REQUIRED_MESSAGE,
  }),
  false,
);

assert.equal(isChatSendBlockedByProfilePhoto(new ChatSendBlockedByProfilePhotoError()), true);
assert.equal(
  isChatSendBlockedByProfilePhoto({
    code: '55000',
    message: SERVER_CHAT_PROFILE_PHOTO_REQUIRED_MESSAGE,
  }),
  true,
);
assert.equal(isChatSendBlockedByProfilePhoto(new Error('network')), false);

console.log('chat-send-eligibility.test.ts ok');
