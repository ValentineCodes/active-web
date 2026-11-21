'use client';

import type { ReactNode } from 'react';

import { AvatarWithViewer } from '@/components/profile/AvatarWithViewer';
import { IconButton } from '@/components/ui/IconButton';
import { isProjectGroupConversation } from '@/features/projects/project-group-chat-display';

export function ConversationHeader({
  counterpartyName,
  counterpartyAvatarPath,
  requestTitle,
  groupMemberSubtitle,
  statusLabel,
  onBack,
  actions,
}: {
  counterpartyName: string | null;
  counterpartyAvatarPath: string | null;
  requestTitle: string;
  /** Comma-separated member names for project group chats. */
  groupMemberSubtitle?: string | null;
  statusLabel?: string | null;
  onBack: () => void;
  actions?: ReactNode;
}) {
  const isProjectGroup = isProjectGroupConversation(counterpartyName);
  const headline = isProjectGroup ? requestTitle : (counterpartyName?.trim().split(/\s+/)[0] ?? 'Chat');
  const subtitle = isProjectGroup
    ? groupMemberSubtitle?.trim() || undefined
    : requestTitle;

  return (
    <header className="border-b border-hairline bg-canvas px-2 pb-3 pt-1">
      <div className="flex flex-row items-center gap-1">
        <IconButton icon="chevron-back" accessibilityLabel="Go back" onClick={onBack} />
        <div className="flex min-w-0 flex-1 flex-row items-center gap-3 py-1">
          {!isProjectGroup ? (
            <AvatarWithViewer path={counterpartyAvatarPath} name={counterpartyName} size="sm" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-ink">{headline}</p>
            {subtitle ? (
              <p className="truncate text-sm text-muted">{subtitle}</p>
            ) : null}
            {statusLabel ? <p className="truncate text-xs text-muted">{statusLabel}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-row items-center">{actions}</div> : null}
      </div>
    </header>
  );
}