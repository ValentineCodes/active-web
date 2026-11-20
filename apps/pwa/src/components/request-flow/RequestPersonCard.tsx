'use client';

import { PreHandshakeDiscussButton } from '@/components/PreHandshakeDiscussButton';
import { PersonRow } from '@/components/ui/PersonRow';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

export function RequestPersonCard({
  avatarPath,
  name,
  ratingAverage,
  ratingCount,
  completionPercent,
  identityVerified,
  onPress,
  onDiscussPress,
  discussLoading,
}: {
  avatarPath: string | null | undefined;
  name: string | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  completionPercent?: number | null;
  identityVerified?: boolean;
  onPress?: () => void;
  onDiscussPress?: () => void;
  discussLoading?: boolean;
}) {
  const colors = useColors();
  const inlineStat = completionPercent != null ? `${completionPercent}% completion` : undefined;

  const row = (
    <PersonRow
      avatarPath={avatarPath}
      name={name}
      ratingAverage={ratingAverage}
      ratingCount={ratingCount}
      inlineStat={inlineStat}
      identityVerified={identityVerified}
      trailing={
        <div className="flex shrink-0 flex-row items-center gap-1 self-center">
          {onDiscussPress ? (
            <PreHandshakeDiscussButton compact onPress={onDiscussPress} loading={discussLoading} />
          ) : null}
          <IonIcon icon={ionIcons['chevron-forward']} size={18} color={colors.subtle} />
        </div>
      }
    />
  );

  const cardClass =
    'shadow-card block w-full rounded-2xl border border-hairline bg-elevated p-4 text-left';

  if (!onPress) {
    return <div className={cardClass}>{row}</div>;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`${cardClass} cursor-pointer active:opacity-90`}
      onClick={onPress}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onPress();
        }
      }}
      aria-label={name ? `View ${name}'s profile` : 'View profile'}
    >
      {row}
    </div>
  );
}
