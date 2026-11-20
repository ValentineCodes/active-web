import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapUsernameMutationError,
  normalizeUsernameInput,
  validateUsernameFormat,
} from './username.ts';

test('normalizeUsernameInput is case-insensitive', () => {
  assert.equal(normalizeUsernameInput('  My_User '), 'my_user');
});

test('validateUsernameFormat accepts valid handles', () => {
  assert.equal(validateUsernameFormat('active_user1'), null);
});

test('validateUsernameFormat rejects short and invalid characters', () => {
  assert.match(validateUsernameFormat('ab') ?? '', /3.*30/);
  assert.match(validateUsernameFormat('bad-handle') ?? '', /letters/i);
});

test('validateUsernameFormat rejects reserved names', () => {
  assert.match(validateUsernameFormat('admin') ?? '', /not available/i);
});

test('mapUsernameMutationError maps taken username', () => {
  assert.match(
    mapUsernameMutationError(new Error('username is already taken')),
    /already taken/i,
  );
});