'use client';

import type { ReactNode } from 'react';

export function GroupChatMessageShell({
  senderName,
  showSenderName,
  isOutgoing,
  children,
}: {
  senderName: string | null;
  showSenderName: boolean;
  isOutgoing: boolean;
  children: ReactNode;
}) {
  if (!showSenderName || isOutgoing || !senderName) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="px-1 text-xs font-semibold text-brand">{senderName}</span>
      {children}
    </div>
  );
}