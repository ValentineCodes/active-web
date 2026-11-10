'use client';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme/ThemeProvider';

export function PreHandshakeDiscussButton({
  onPress,
  loading = false,
  compact = false,
}: {
  onPress: () => void;
  loading?: boolean;
  compact?: boolean;
}) {
  const colors = useColors();
  const size = compact ? 40 : 56;
  const iconSize = compact ? 20 : 24;

  return (
    <button
      type="button"
      aria-label="Discuss"
      aria-busy={loading}
      disabled={loading}
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={{ height: size, width: size, borderRadius: size / 2 }}
      className={cn(
        'flex shrink-0 items-center justify-center border border-hairline bg-active-soft',
        loading && 'opacity-60',
      )}
    >
      {loading ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-active border-t-transparent" />
      ) : (
        <IonIcon icon={ionIcons['chatbubble-outline']} size={iconSize} color={colors.active} />
      )}
    </button>
  );
}
