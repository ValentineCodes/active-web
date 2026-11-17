'use client';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { formatFileSizeBytes } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme/ThemeProvider';

export function FileAttachmentRow({
  fileName,
  fileSize,
  isOutgoing,
  onOpen,
  disabled = false,
  minWidth,
}: {
  fileName: string;
  fileSize: number | null | undefined;
  isOutgoing: boolean;
  onOpen: () => void;
  disabled?: boolean;
  minWidth?: number;
}) {
  const colors = useColors();
  const sizeLabel = formatFileSizeBytes(fileSize);
  const iconColor = isOutgoing ? colors.onBrand : colors.active;
  const openIconColor = isOutgoing ? colors.onBrand : colors.subtle;

  return (
    <button
      type="button"
      aria-label={`Open ${fileName}`}
      onClick={onOpen}
      disabled={disabled}
      style={minWidth ? { minWidth } : undefined}
      className={cn(
        'flex w-full flex-row items-center gap-3 self-stretch px-4 py-3 text-left active:opacity-90 disabled:opacity-50',
      )}
    >
      <IonIcon icon={ionIcons['document-outline']} size={24} color={iconColor} />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-base font-semibold',
            isOutgoing ? 'text-on-brand' : 'text-ink',
          )}
        >
          {fileName}
        </span>
        {sizeLabel ? (
          <span className={cn('block text-xs', isOutgoing ? 'text-on-brand/80' : 'text-muted')}>
            {sizeLabel}
          </span>
        ) : null}
      </span>
      <IonIcon icon={ionIcons['open-outline']} size={20} color={openIconColor} />
    </button>
  );
}