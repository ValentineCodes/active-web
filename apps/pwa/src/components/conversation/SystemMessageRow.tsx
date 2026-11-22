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
    key.startsWith('assignment_submitted') ||
    /marked the request as complete/i.test(message.body) ||
    /says the work is done/i.test(message.body) ||
    displayBody.startsWith('You marked') ||
    displayBody.startsWith('You say');
  const paymentLike =
    key.startsWith('assignment_payment_released') ||
    /payment has been released/i.test(displayBody);
  const icon = paymentLike
    ? ionIcons['wallet-outline']
    : completionLike
      ? ionIcons['checkmark-circle-outline']
      : ionIcons['information-circle-outline'];

  return (
    <div className="flex w-full justify-center px-2 py-1">
      <div
        className={cn(
          'flex max-w-sm items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 shadow-card',
          paymentLike
            ? 'border-brand/25 bg-brand-soft/70'
            : completionLike
              ? 'border-active/25 bg-active-soft/70'
              : 'border-hairline bg-surface',
        )}
        role="status"
      >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-elevated">
          <IonIcon
            icon={icon}
            size={16}
            color={paymentLike ? colors.brand : completionLike ? colors.active : colors.muted}
          />
        </span>
        <p className="min-w-0 flex-1 text-left text-sm font-medium leading-5 text-muted">{displayBody}</p>
      </div>
    </div>
  );
}