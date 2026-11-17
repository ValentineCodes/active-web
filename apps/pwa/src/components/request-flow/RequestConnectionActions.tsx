'use client';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons, type IonIconName } from '@/components/ui/ion-icons';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme/ThemeProvider';

function ConnectionAction({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: IonIconName;
  onClick: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'shadow-card flex min-w-0 flex-1 flex-col items-center gap-2.5 rounded-2xl border border-hairline bg-elevated py-4 active:opacity-90',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-active-soft">
        <IonIcon icon={ionIcons[icon]} size={22} color={colors.active} />
      </span>
      <span className="text-sm font-semibold text-ink">{label}</span>
    </button>
  );
}

export function RequestConnectionActions({
  onChat,
  onCall,
  onViewMap,
  chatDisabled,
  callDisabled,
  chatOnly = false,
  showCall = true,
}: {
  onChat: () => void;
  onCall: () => void;
  onViewMap: () => void;
  chatDisabled?: boolean;
  callDisabled?: boolean;
  chatOnly?: boolean;
  showCall?: boolean;
}) {
  return (
    <div className="flex flex-row gap-3">
      <ConnectionAction
        label="Chat"
        icon="chatbubble-outline"
        onClick={onChat}
        disabled={chatDisabled}
      />
      {chatOnly ? null : (
        <>
          {showCall ? (
            <ConnectionAction
              label="Call"
              icon="call-outline"
              onClick={onCall}
              disabled={callDisabled}
            />
          ) : null}
          <ConnectionAction label="View map" icon="location-outline" onClick={onViewMap} />
        </>
      )}
    </div>
  );
}