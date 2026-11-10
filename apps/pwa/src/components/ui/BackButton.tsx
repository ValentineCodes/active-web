'use client';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';

type Props = {
  onClick: () => void;
  accessibilityLabel?: string;
};

/** Matches native auth back control (`arrow-back`, 24px). */
export function BackButton({ onClick, accessibilityLabel = 'Go back' }: Props) {
  return (
    <button
      type="button"
      aria-label={accessibilityLabel}
      onClick={onClick}
      className="mb-2 self-start rounded-full p-0 text-ink active:opacity-70"
    >
      <IonIcon icon={ionIcons['arrow-back']} size={24} color="currentColor" />
    </button>
  );
}
