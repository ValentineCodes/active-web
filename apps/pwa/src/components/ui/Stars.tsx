'use client';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme/ThemeProvider';

const VALUES = [1, 2, 3, 4, 5] as const;

export function StarRating({
  average,
  count,
  size = 'sm',
}: {
  average: number | null;
  count: number;
  size?: 'sm' | 'md';
}) {
  if (count === 0 || average === null) {
    return <span className="text-sm text-muted">No ratings yet</span>;
  }

  return (
    <span
      className={cn('inline-flex items-center gap-1 font-semibold text-warning', size === 'md' ? 'text-base' : 'text-sm')}
      aria-label={`Rated ${average.toFixed(1)} out of 5 from ${count} ratings`}
    >
      ★ {average.toFixed(1)}
    </span>
  );
}

export function StarPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (stars: number) => void;
}) {
  const colors = useColors();

  return (
    <div className="flex flex-row justify-center gap-3" role="radiogroup" aria-label="Rating">
      {VALUES.map((star) => {
        const filled = value !== null && star <= value;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
            className="rounded-full p-1 active:opacity-80"
            onClick={() => onChange(star)}
          >
            <IonIcon
              icon={filled ? ionIcons.star : ionIcons['star-outline']}
              size={40}
              color={filled ? colors.warning : colors.hairline}
            />
          </button>
        );
      })}
    </div>
  );
}
