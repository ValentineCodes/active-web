import { cn } from '@/lib/cn';

export function TagPill({
  label,
  selected,
}: {
  label: string;
  selected: boolean;
}) {
  return (
    <span
      aria-label={label}
      className={cn(
        'inline-flex self-start rounded-full border px-4 py-2',
        selected ? 'border-active/25 bg-active-soft' : 'border-hairline bg-elevated',
      )}
    >
      <span className={cn('text-xs font-medium', selected ? 'text-active' : 'text-ink')}>{label}</span>
    </span>
  );
}
