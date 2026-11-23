import type { CreateChoice } from '@/components/create/CreateChoiceSheet';

import { consumePendingAction, type PendingAction } from '@/features/auth/pending-action';

export const RESUME_CONTRIBUTE_QUERY = 'contribute';
export const RESUME_CREATE_COMPOSER_KEY = 'active:open-create-composer-after-auth';

type ResumeRouter = {
  replace: (href: string) => void;
  push: (href: string) => void;
};

export function buildResumeTarget(action: PendingAction): string {
  switch (action.type) {
    case 'navigate':
      return action.path;
    case 'respond':
      return `/request/${action.requestId}?start=1`;
    case 'contribute':
      return `/project/${action.projectId}?${RESUME_CONTRIBUTE_QUERY}=1`;
    case 'create':
      if (action.choice === 'request') return '/request/new';
      if (action.choice === 'project') return '/project/new';
      return '/home';
    case 'notifications':
      return '/notifications';
    case 'profile':
      return '/profile';
    default:
      return '/home';
  }
}

export function pendingActionNeedsCreateComposer(action: PendingAction): CreateChoice | null {
  if (action.type !== 'create' || action.choice) return null;
  return null;
}

export function armOpenCreateComposerAfterAuth(): void {
  sessionStorage.setItem(RESUME_CREATE_COMPOSER_KEY, '1');
}

export function consumeOpenCreateComposerAfterAuth(): boolean {
  const value = sessionStorage.getItem(RESUME_CREATE_COMPOSER_KEY);
  sessionStorage.removeItem(RESUME_CREATE_COMPOSER_KEY);
  return value === '1';
}

export function resumePendingAction(router: ResumeRouter): PendingAction | null {
  const action = consumePendingAction();
  if (!action) {
    router.replace('/home');
    return null;
  }

  if (action.type === 'create' && !action.choice) {
    armOpenCreateComposerAfterAuth();
    router.replace('/home');
    return action;
  }

  router.replace(buildResumeTarget(action));
  return action;
}