'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

type FilterOption = { value: string; label: string };

type Props = {
  basePath: string;
  searchPlaceholder: string;
  filterOptions?: FilterOption[];
  filterParam?: string;
};

export function ListToolbar({
  basePath,
  searchPlaceholder,
  filterOptions,
  filterParam = 'filter',
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const activeFilter = searchParams.get(filterParam) ?? 'all';

  const apply = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    params.delete('offset');
    startTransition(() => {
      router.push(`${basePath}?${params.toString()}`);
    });
  };

  return (
    <form
      className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
      onSubmit={(event) => {
        event.preventDefault();
        apply({ q: query.trim() || undefined });
      }}
    >
      <div className="flex flex-1 flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border border-border bg-elevated px-3 py-2.5 text-sm outline-none ring-brand/30 focus:ring-2 sm:max-w-md"
        />
        <Button type="submit" variant="secondary" loading={pending}>
          Search
        </Button>
      </div>
      {filterOptions ? (
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                apply({ [filterParam]: option.value === 'all' ? undefined : option.value })
              }
              className={
                activeFilter === option.value
                  ? 'rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white'
                  : 'rounded-lg border border-border bg-elevated px-3 py-1.5 text-sm text-muted hover:text-ink'
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}
