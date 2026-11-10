type TabPath = '/home' | '/activity' | '/notifications';

let lastTab: TabPath = '/home';
let pendingReturnAfterComposer = false;

export function noteActiveTabPath(pathname: string) {
  if (pathname === '/activity' || pathname.startsWith('/activity/')) {
    lastTab = '/activity';
    return;
  }
  if (pathname === '/notifications' || pathname.startsWith('/notifications/')) {
    lastTab = '/notifications';
    return;
  }
  if (pathname === '/home' || pathname.startsWith('/home/')) {
    lastTab = '/home';
  }
}

export function armCreateComposerReturn() {
  pendingReturnAfterComposer = true;
}

export function consumeCreateComposerReturn(): TabPath | null {
  if (!pendingReturnAfterComposer) return null;
  pendingReturnAfterComposer = false;
  return lastTab;
}

export function clearCreateComposerReturn() {
  pendingReturnAfterComposer = false;
}
