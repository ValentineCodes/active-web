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
  onPress,
  onDiscussPress,
  discussLoading,
}: {
  avatarPath: string | null | undefined;
  name: string | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  completionPercent?: number | null;
  onPress?: () => void;
  onDiscussPress?: () => void;
  discussLoading?: boolean;
}) {
  const colors = useColors();
  const inlineStat = completionPercent != null ? `${completionPercent}% completion` : undefined;

  return (
    <div className="shadow-card overflow-hidden rounded-2xl border border-hairline bg-elevated p-4">
      <PersonRow
        avatarPath={avatarPath}
        name={name}
        ratingAverage={ratingAverage}
        ratingCount={ratingCount}
        inlineStat={inlineStat}
        onPress={onPress}
        trailing={
          <div className="flex flex-row items-center gap-1">
            {onDiscussPress ? (
              <PreHandshakeDiscussButton compact onPress={onDiscussPress} loading={discussLoading} />
            ) : null}
            <IonIcon icon={ionIcons['chevron-forward']} size={18} color={colors.subtle} />
          </div>
        }
      />
    </div>
  );
}
