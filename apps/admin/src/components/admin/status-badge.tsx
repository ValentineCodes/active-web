import { cn } from '@/lib/cn';

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.replaceAll('_', ' ');
  const tone =
    status === 'disputed' || status === 'open' || status === 'rejected' || status === 'failed'
      ? 'bg-red-50 text-red-800'
      : status === 'completed' || status === 'released'
        ? 'bg-emerald-50 text-emerald-800'
        : status === 'processing'
          ? 'bg-amber-50 text-amber-900'
          : status === 'posted' || status === 'awaiting_review' || status === 'pending'
            ? 'bg-sky-50 text-sky-800'
            : 'bg-surface text-muted';

  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', tone)}>
      {normalized}
    </span>
  );
}
