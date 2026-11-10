'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import {
  clearSearchRecents,
  loadSearchRecents,
  rememberSearchQuery,
  type SearchRecent,
} from '@/features/requests/home-search';

export function SearchPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [recents, setRecents] = useState<SearchRecent[]>([]);

  useEffect(() => {
    void loadSearchRecents().then(setRecents);
  }, []);

  const submit = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    await rememberSearchQuery(trimmed);
    router.push(`/home?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <FlowScreen title="Search" backTo="/home" bodyClassName="flex flex-col gap-4">
      <TextField
        label="Search requests"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Tags, titles, or keywords"
        onKeyDown={(event) => {
          if (event.key === 'Enter') void submit();
        }}
      />
      <Button label="Search" onClick={() => void submit()} disabled={!query.trim()} />

      {recents.length > 0 ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted">Recent</h2>
            <button
              type="button"
              className="text-sm font-semibold text-brand"
              onClick={() => {
                void clearSearchRecents().then(() => setRecents([]));
              }}
            >
              Clear
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {recents.map((item) => (
              <li key={item.query}>
                <button
                  type="button"
                  onClick={() => {
                    setQuery(item.query);
                    void rememberSearchQuery(item.query).then(() =>
                      router.push(`/home?q=${encodeURIComponent(item.query)}`),
                    );
                  }}
                  className="w-full rounded-2xl border border-hairline bg-elevated px-4 py-3 text-left text-sm font-medium text-ink active:opacity-90"
                >
                  {item.query}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </FlowScreen>
  );
}
