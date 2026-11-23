import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearPendingAction,
  contextualAuthActionForPath,
  consumePendingAction,
  readPendingAction,
  savePendingAction,
  validatePendingAction,
} from '@/features/auth/pending-action';
import { buildResumeTarget } from '@/features/auth/pending-action-resume';
import { validateInternalPath } from '@/lib/validate-internal-path';

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

describe('validateInternalPath', () => {
  it('accepts in-app paths and rejects external targets', () => {
    expect(validateInternalPath('/home')).toBe('/home');
    expect(validateInternalPath('/request/' + REQUEST_ID)).toBe('/request/' + REQUEST_ID);
    expect(validateInternalPath('//evil.example')).toBeNull();
    expect(validateInternalPath('https://evil.example')).toBeNull();
    expect(validateInternalPath(null)).toBeNull();
  });
});

describe('pending auth actions', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('stores and consumes each of the five gate action types', () => {
    expect(savePendingAction({ type: 'profile' })).toBe(true);
    expect(consumePendingAction()?.type).toBe('profile');

    expect(savePendingAction({ type: 'notifications' })).toBe(true);
    expect(consumePendingAction()?.type).toBe('notifications');

    expect(savePendingAction({ type: 'respond', requestId: REQUEST_ID })).toBe(true);
    expect(consumePendingAction()?.type).toBe('respond');

    expect(savePendingAction({ type: 'contribute', projectId: PROJECT_ID })).toBe(true);
    expect(consumePendingAction()?.type).toBe('contribute');

    expect(savePendingAction({ type: 'create', choice: 'request' })).toBe(true);
    expect(consumePendingAction()?.type).toBe('create');
  });

  it('rejects malformed ids and paths', () => {
    expect(savePendingAction({ type: 'respond', requestId: 'not-a-uuid' })).toBe(false);
    expect(savePendingAction({ type: 'navigate', path: '//bad' } as never)).toBe(false);
    expect(readPendingAction()).toBeNull();
  });

  it('expires stale pending actions', () => {
    savePendingAction({ type: 'profile' });
    vi.setSystemTime(new Date('2026-03-15T13:01:00Z'));
    expect(readPendingAction()).toBeNull();
  });

  it('clears on dismiss via clearPendingAction', () => {
    savePendingAction({ type: 'notifications' });
    clearPendingAction();
    expect(readPendingAction()).toBeNull();
  });

  it('maps contextual auth paths for profile, notifications, and create', () => {
    expect(contextualAuthActionForPath('/profile')?.type).toBe('profile');
    expect(contextualAuthActionForPath('/notifications')?.type).toBe('notifications');
    const createAction = contextualAuthActionForPath('/request/new');
    expect(createAction?.type).toBe('create');
    if (createAction?.type === 'create') expect(createAction.choice).toBe('request');
    expect(contextualAuthActionForPath('/wallet')).toBeNull();
  });

  it('builds resume targets without auto-submit parameters', () => {
    const respond = validatePendingAction({
      type: 'respond',
      requestId: REQUEST_ID,
      savedAt: Date.now(),
    });
    expect(buildResumeTarget(respond!)).toBe(`/request/${REQUEST_ID}?start=1`);

    const contribute = validatePendingAction({
      type: 'contribute',
      projectId: PROJECT_ID,
      savedAt: Date.now(),
    });
    expect(buildResumeTarget(contribute!)).toBe(`/project/${PROJECT_ID}?contribute=1`);
    expect(buildResumeTarget(contribute!)).not.toContain('amount');
  });
});