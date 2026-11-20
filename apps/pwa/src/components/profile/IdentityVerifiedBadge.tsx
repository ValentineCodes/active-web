'use client';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

export function IdentityVerifiedBadge({ size = 18 }: { size?: number }) {
  const colors = useColors();

  return (
    <span className="inline-flex shrink-0" aria-label="Identity verified" role="img">
      <IonIcon icon={ionIcons['checkmark-circle']} size={size} color={colors.active} />
    </span>
  );
}