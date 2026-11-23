'use client';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

export function ProjectGroupChatFab({
  onPress,
  unreadCount = 0,
  accessibilityLabel = 'Open project team chat',
}: {
  onPress: () => void;
  unreadCount?: number;
  accessibilityLabel?: string;
}) {
  const colors = useColors();

  return (
    <button
      type="button"
      aria-label={accessibilityLabel}
      onClick={onPress}
      className="absolute right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-hairline bg-active shadow-card active:opacity-90"
      style={{
        bottom: 'max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))',
      }}
    >
      <IonIcon icon={ionIcons['chatbubble-outline']} size={26} color={colors.onBrand} />
      {unreadCount > 0 ? (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-active bg-danger"
        />
      ) : null}
    </button>
  );
}