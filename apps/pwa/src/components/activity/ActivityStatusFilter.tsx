import { cn } from '@/lib/cn';

type Option<T extends string> = {
  value: T;
  label: string;
};

export function ActivityStatusFilter<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly Option<T>[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto px-5 pb-2 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              if (!selected) onChange(option.value);
            }}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold active:opacity-90',
              selected ? 'bg-elevated text-ink' : 'bg-surface text-muted',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
