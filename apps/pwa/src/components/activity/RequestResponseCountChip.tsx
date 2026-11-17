'use client';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme/ThemeProvider';

export function requestResponseCountLabel(count: number): string {
  if (count <= 0) return 'Waiting for responses';
  if (count === 1) return '1 response';
  return `${count} responses`;
}

export function RequestResponseCountChip({
  count,
  size = 'sm',
}: {
  count: number;
  size?: 'sm' | 'md';
}) {
  const colors = useColors();
  const hasResponses = count > 0;

  return (
    <span
      className={cn(
        'inline-flex w-fit max-w-full shrink-0 self-start items-center gap-1.5 rounded-full',
        size === 'md' ? 'px-3 py-1.5' : 'px-2.5 py-1',
        hasResponses ? 'bg-active-soft' : 'bg-surface',
      )}
    >
      {hasResponses ? (
        <IonIcon icon={ionIcons['chatbubble-outline']} size={size === 'md' ? 16 : 14} color={colors.active} />
      ) : (
        <span
          className={cn('shrink-0 rounded-full bg-subtle', size === 'md' ? 'h-2 w-2' : 'h-1.5 w-1.5')}
          aria-hidden
        />
      )}
      <span
        className={cn(
          'truncate font-semibold',
          size === 'md' ? 'text-sm' : 'text-xs',
          hasResponses ? 'text-active' : 'text-muted',
        )}
      >
        {requestResponseCountLabel(count)}
      </span>
    </span>
  );
}