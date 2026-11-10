import { cn } from '@/lib/cn';

export function TagPill({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const className = cn(
    'inline-flex self-start rounded-full border px-4 py-2.5',
    selected ? 'border-active/25 bg-active-soft' : 'border-hairline bg-elevated',
    disabled && !selected && 'opacity-50',
    onPress && 'active:opacity-90',
  );
  const textClassName = cn('text-sm font-medium', selected ? 'text-active' : 'text-ink');

  if (!onPress) {
    return (
      <span aria-label={label} className={className}>
        <span className={textClassName}>{label}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onPress}
      className={className}
    >
      <span className={textClassName}>{label}</span>
    </button>
  );
}
