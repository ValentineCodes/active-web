'use client';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { cn } from '@/lib/cn';

export function ConversationImageCountBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count < 2) return null;

  return (
    <span
      className={cn(
        'pointer-events-none inline-flex items-center gap-1 rounded-full border border-white/25',
        'bg-black/50 px-2 py-1 shadow-sm backdrop-blur-md',
        className,
      )}
      aria-hidden
    >
      <IonIcon icon={ionIcons['images-outline']} size={13} color="#ffffff" />
      <span className="text-xs font-semibold tabular-nums leading-none text-white">{count}</span>
    </span>
  );
}