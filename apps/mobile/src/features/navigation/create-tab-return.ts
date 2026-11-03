type TabReturnHref = '/(tabs)/' | '/(tabs)/activity' | '/(tabs)/notifications';

let lastTab: TabReturnHref = '/(tabs)/';
let pendingReturnAfterComposer = false;

export function noteActiveTabSegment(segments: readonly string[]) {
  if (segments[0] !== '(tabs)' || !segments[1] || segments[1] === 'create') return;

  if (segments[1] === 'activity') {
    lastTab = '/(tabs)/activity';
    return;
  }
  if (segments[1] === 'notifications') {
    lastTab = '/(tabs)/notifications';
    return;
  }
  if (segments[1] === 'index') {
    lastTab = '/(tabs)/';
  }
}

export function armCreateComposerReturn() {
  pendingReturnAfterComposer = true;
}

export function consumeCreateComposerReturn(): TabReturnHref | null {
  if (!pendingReturnAfterComposer) return null;
  pendingReturnAfterComposer = false;
  return lastTab;
}
