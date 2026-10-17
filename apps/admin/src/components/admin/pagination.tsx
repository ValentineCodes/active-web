import Link from 'next/link';

import { cn } from '@/lib/cn';

type Props = {
  basePath: string;
  searchParams: Record<string, string | undefined>;
  total: number;
  limit: number;
  offset: number;
};

export function ListPagination({ basePath, searchParams, total, limit, offset }: Props) {
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const hasPrev = offset > 0;
  const hasNext = nextOffset < total;

  const hrefFor = (nextOffsetValue: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value) params.set(key, value);
    }
    params.set('offset', String(nextOffsetValue));
    params.set('limit', String(limit));
    return `${basePath}?${params.toString()}`;
  };

  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-4 text-sm">
      <p className="text-muted">
        {total === 0 ? 'No results' : `Showing ${offset + 1}–${Math.min(offset + limit, total)} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={hasPrev ? hrefFor(prevOffset) : '#'}
          className={cn(
            'rounded-lg border border-border px-3 py-1.5',
            hasPrev ? 'hover:bg-surface' : 'pointer-events-none opacity-40',
          )}
          aria-disabled={!hasPrev}
        >
          Previous
        </Link>
        <span className="tabular-nums text-muted">Page {page} / {pages}</span>
        <Link
          href={hasNext ? hrefFor(nextOffset) : '#'}
          className={cn(
            'rounded-lg border border-border px-3 py-1.5',
            hasNext ? 'hover:bg-surface' : 'pointer-events-none opacity-40',
          )}
          aria-disabled={!hasNext}
        >
          Next
        </Link>
      </div>
    </div>
  );
}
