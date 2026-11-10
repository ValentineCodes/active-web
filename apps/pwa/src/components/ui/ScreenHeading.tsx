'use client';

import { BackButton } from '@/components/ui/BackButton';

/** Native auth-style stack: back control, then `text-2xl` title. */
export function ScreenHeading({
  title,
  onBack,
}: {
  title: string;
  onBack?: () => void;
}) {
  return (
    <div className="flex flex-col">
      {onBack ? <BackButton onClick={onBack} /> : null}
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
    </div>
  );
}
