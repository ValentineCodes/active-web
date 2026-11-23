import { validateInternalPath } from '@/lib/validate-internal-path';

import type { CreateChoice } from '@/components/create/CreateChoiceSheet';

export type PendingActionType =
  | 'navigate'
  | 'respond'
  | 'contribute'
  | 'create'
  | 'notifications'
  | 'profile';

export type PendingAction =
  | { type: 'navigate'; path: string; savedAt: number }
  | { type: 'respond'; requestId: string; savedAt: number }
  | { type: 'contribute'; projectId: string; savedAt: number }
  | { type: 'create'; choice?: CreateChoice; savedAt: number }
  | { type: 'notifications'; savedAt: number }
  | { type: 'profile'; savedAt: number };

export type PendingActionInput =
  | { type: 'navigate'; path: string }
  | { type: 'respond'; requestId: string }
  | { type: 'contribute'; projectId: string }
  | { type: 'create'; choice?: CreateChoice }
  | { type: 'notifications' }
  | { type: 'profile' };

const STORAGE_KEY = 'active:pending-auth-action';
const MAX_AGE_MS = 30 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function validatePendingAction(raw: unknown): PendingAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const savedAt = record.savedAt;
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null;
  if (Date.now() - savedAt > MAX_AGE_MS) return null;

  const type = record.type;
  if (type === 'navigate') {
    const path = validateInternalPath(typeof record.path === 'string' ? record.path : '');
    if (!path) return null;
    return { type: 'navigate', path, savedAt };
  }
  if (type === 'respond') {
    const requestId = typeof record.requestId === 'string' ? record.requestId.trim() : '';
    if (!isUuid(requestId)) return null;
    return { type: 'respond', requestId, savedAt };
  }
  if (type === 'contribute') {
    const projectId = typeof record.projectId === 'string' ? record.projectId.trim() : '';
    if (!isUuid(projectId)) return null;
    return { type: 'contribute', projectId, savedAt };
  }
  if (type === 'create') {
    const choice = record.choice;
    if (choice !== undefined && choice !== 'request' && choice !== 'project') return null;
    return { type: 'create', choice, savedAt };
  }
  if (type === 'notifications') return { type: 'notifications', savedAt };
  if (type === 'profile') return { type: 'profile', savedAt };
  return null;
}

export function readPendingAction(): PendingAction | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const valid = validatePendingAction(parsed);
    if (!valid) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return valid;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function savePendingAction(input: PendingActionInput): boolean {
  const next = { ...input, savedAt: Date.now() };
  const validated = validatePendingAction(next);
  if (!validated) return false;

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
  return true;
}

export function clearPendingAction(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function consumePendingAction(): PendingAction | null {
  const action = readPendingAction();
  clearPendingAction();
  return action;
}

export function hasPendingAction(): boolean {
  return readPendingAction() !== null;
}

/** Protected paths that use contextual auth instead of sending guests to home only. */
export function contextualAuthActionForPath(pathname: string): PendingActionInput | null {
  if (pathname === '/profile' || pathname.startsWith('/profile/')) {
    return { type: 'profile' };
  }
  if (pathname === '/notifications' || pathname.startsWith('/notifications/')) {
    return { type: 'notifications' };
  }
  if (pathname === '/request/new' || pathname.startsWith('/request/new/')) {
    return { type: 'create', choice: 'request' };
  }
  if (pathname === '/project/new' || pathname.startsWith('/project/new/')) {
    return { type: 'create', choice: 'project' };
  }
  return null;
}

export const CONTEXTUAL_AUTH_COPY: Record<PendingActionType, { hint: string | null; logInLabel: string }> = {
  profile: {
    hint: 'Open your profile, wallet, and account settings after you verify your phone number.',
    logInLabel: 'Log in',
  },
  respond: {
    hint: 'You can review your response before you submit it.',
    logInLabel: 'Log in',
  },
  contribute: {
    hint: 'You will choose the amount before anything is charged.',
    logInLabel: 'Log in',
  },
  create: {
    hint: 'Post a request or project after a quick phone verification.',
    logInLabel: 'Log in',
  },
  notifications: {
    hint: 'See updates on your requests, projects, and messages.',
    logInLabel: 'Log in',
  },
  navigate: {
    hint: null,
    logInLabel: 'Log in',
  },
};