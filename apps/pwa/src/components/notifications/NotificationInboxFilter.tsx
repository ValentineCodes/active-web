import { cn } from '@/lib/cn';

export type InboxFilter = 'all' | 'unread';

export function NotificationInboxFilter({
  value,
  onChange,
}: {
  value: InboxFilter;
  onChange: (next: InboxFilter) => void;
}) {
  return (
    <div
      className="inline-flex flex-row rounded-full bg-surface p-1"
      role="group"
      aria-label="Filter notifications"
    >
      {(['all', 'unread'] as const).map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              if (!selected) onChange(option);
            }}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-semibold capitalize active:opacity-90',
              selected ? 'bg-elevated text-ink' : 'text-muted',
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
