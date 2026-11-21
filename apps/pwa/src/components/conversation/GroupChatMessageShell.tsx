'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

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
    <div className={cn('flex max-w-[92%] flex-col gap-0.5 self-start')}>
      <p className="px-1 text-xs font-semibold text-brand">{senderName}</p>
      {children}
    </div>
  );
}