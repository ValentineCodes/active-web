'use client';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import {
  sharedLocationMapsUrl,
  SHARED_LOCATION_MESSAGE_LABEL,
} from '@/features/requests/conversation-shared-location';
import type { Position } from '@/lib/geolocation';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme/ThemeProvider';

export function SharedLocationMessageBubble({
  position,
  isOutgoing,
}: {
  position: Position;
  isOutgoing: boolean;
}) {
  const colors = useColors();
  const mapsUrl = sharedLocationMapsUrl(position);

  return (
    <div className={cn('max-w-[85%]', isOutgoing ? 'self-end' : 'self-start')}>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex flex-row items-center gap-3 rounded-2xl px-4 py-3 active:opacity-90',
          isOutgoing ? 'rounded-br-md bg-active text-on-brand' : 'rounded-bl-md border border-hairline bg-elevated',
        )}
      >
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            isOutgoing ? 'bg-on-brand/15' : 'bg-active-soft',
          )}
        >
          <IonIcon
            icon={ionIcons['location-outline']}
            size={22}
            color={isOutgoing ? colors.onBrand : colors.active}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-base font-semibold leading-5', isOutgoing ? 'text-on-brand' : 'text-ink')}>
            {SHARED_LOCATION_MESSAGE_LABEL.replace('📍 ', '')}
          </span>
          <span className={cn('block text-sm leading-5', isOutgoing ? 'text-on-brand/85' : 'text-muted')}>
            Open in Maps
          </span>
        </span>
        <IonIcon
          icon={ionIcons['navigate-outline']}
          size={20}
          color={isOutgoing ? colors.onBrand : colors.active}
        />
      </a>
    </div>
  );
}