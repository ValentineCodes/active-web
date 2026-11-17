'use client';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

export function RequestExactLocationCard({
  address,
  onDirections,
}: {
  address: string;
  onDirections: () => void;
}) {
  const colors = useColors();

  return (
    <button
      type="button"
      aria-label="Open directions"
      onClick={onDirections}
      className="shadow-card flex w-full flex-row items-center gap-3 rounded-2xl border border-hairline bg-elevated p-4 text-left active:opacity-90"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-active-soft">
        <IonIcon icon={ionIcons['location-outline']} size={22} color={colors.active} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-subtle">
          Exact location
        </span>
        <span className="mt-0.5 block text-base font-semibold text-ink">{address}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-active">Directions</span>
    </button>
  );
}