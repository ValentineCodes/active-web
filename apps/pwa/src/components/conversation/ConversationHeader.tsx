'use client';

import type { ReactNode } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';

export function ConversationHeader({
  counterpartyName,
  counterpartyAvatarPath,
  requestTitle,
  statusLabel,
  onBack,
  actions,
}: {
  counterpartyName: string | null;
  counterpartyAvatarPath: string | null;
  requestTitle: string;
  statusLabel?: string | null;
  onBack: () => void;
  actions?: ReactNode;
}) {
  const firstName = counterpartyName?.trim().split(/\s+/)[0] ?? 'Chat';

  return (
    <header className="border-b border-hairline bg-canvas px-2 pb-3 pt-1">
      <div className="flex flex-row items-center gap-1">
        <IconButton icon="chevron-back" accessibilityLabel="Go back" onClick={onBack} />
        <div className="flex min-w-0 flex-1 flex-row items-center gap-3 py-1">
          <Avatar path={counterpartyAvatarPath} name={counterpartyName} size="sm" />
          <div className="min-w-0 flex-1 gap-0.5">
            <p className="truncate text-lg font-bold text-ink">{firstName}</p>
            <p className="line-clamp-2 text-sm text-muted">{requestTitle}</p>
            {statusLabel ? <p className="line-clamp-1 text-xs text-muted">{statusLabel}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-row items-center">{actions}</div> : null}
      </div>
    </header>
  );
}
