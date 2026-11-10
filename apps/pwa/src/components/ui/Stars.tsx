import { cn } from '@/lib/cn';

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
