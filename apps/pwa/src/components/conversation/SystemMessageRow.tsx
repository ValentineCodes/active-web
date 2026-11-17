'use client';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import type { RequestMessage } from '@/features/requests/conversation-message-model';
import { viewerFacingSystemMessageBody } from '@/features/requests/conversation-system-message-display';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme/ThemeProvider';

function lifecycleKey(message: RequestMessage): string {
  const meta = message.metadata;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return '';
  if ('lifecycle_key' in meta && typeof meta.lifecycle_key === 'string') return meta.lifecycle_key;
  return '';
}

/** Centered timeline chip — not a chat bubble. */
export function SystemMessageRow({
  message,
  viewerUserId,
}: {
  message: RequestMessage;
  viewerUserId?: string | null;
}) {
  const colors = useColors();
  const displayBody = viewerFacingSystemMessageBody(message, viewerUserId);
  const key = lifecycleKey(message);
  const completionLike =
    key.includes('complete') ||
    /marked the request as complete/i.test(message.body) ||
    displayBody.startsWith('You marked');
  const icon = completionLike ? ionIcons['checkmark-circle-outline'] : ionIcons['information-circle-outline'];

  return (
    <div className="flex w-full justify-center px-2 py-1">
      <div
        className={cn(
          'flex max-w-sm items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 shadow-card',
          completionLike ? 'border-active/25 bg-active-soft/70' : 'border-hairline bg-surface',
        )}
        role="status"
      >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-elevated">
          <IonIcon
            icon={icon}
            size={16}
            color={completionLike ? colors.active : colors.muted}
          />
        </span>
        <p className="min-w-0 flex-1 text-left text-sm font-medium leading-5 text-muted">{displayBody}</p>
      </div>
    </div>
  );
}