'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import {
  clearSearchRecents,
  loadSearchRecents,
  rememberSearchQuery,
  type SearchRecent,
} from '@/features/requests/home-search';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme/ThemeProvider';

export function SearchPage() {
  const router = useRouter();
  const colors = useColors();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [focused, setFocused] = useState(false);
  const [recents, setRecents] = useState<SearchRecent[]>([]);

  const trimmedQuery = query.trim();
  const showClearRecents = !trimmedQuery && recents.length > 0;

  useEffect(() => {
    void loadSearchRecents().then(setRecents);
  }, []);

  const submitQuery = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      await rememberSearchQuery(trimmed);
      router.push(`/home?q=${encodeURIComponent(trimmed)}`);
    },
    [router],
  );

  return (
    <FlowScreen title="Search" backTo="/home" bodyClassName="flex flex-col gap-2">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submitQuery(query);
        }}
      >
        <input
          autoFocus
          type="search"
          enterKeyHint="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Active"
          aria-label="Search Active"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={cn(
            'w-full rounded-2xl border-2 py-4 px-4 text-sm text-ink outline-none placeholder:text-subtle',
            focused ? 'border-brand bg-canvas' : 'border-transparent bg-surface',
          )}
        />
      </form>

      {showClearRecents ? (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            className="text-sm font-semibold text-brand"
            onClick={() => {
              void clearSearchRecents().then(() => setRecents([]));
            }}
          >
            Clear recents
          </button>
        </div>
      ) : null}

      {!trimmedQuery ? (
        <ul className="flex flex-col py-2">
          {recents.length === 0 ? (
            <li className="py-6 text-center text-sm text-muted">Your recent searches will appear here.</li>
          ) : (
            recents.map((item) => (
              <li key={item.query} className="flex items-center gap-2 py-1">
                <button
                  type="button"
                  onClick={() => void submitQuery(item.query)}
                  aria-label={`Search for ${item.query}`}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left active:opacity-80"
                >
                  <IonIcon icon={ionIcons['time-outline']} size={22} color={colors.muted} />
                  <span className="flex-1 truncate text-lg text-ink">{item.query}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQuery(item.query)}
                  aria-label={`Use ${item.query} as the search text`}
                  className="p-2 active:opacity-70"
                >
                  <span className="inline-block -rotate-[135deg]">
                    <IonIcon icon={ionIcons['arrow-forward']} size={20} color={colors.subtle} />
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </FlowScreen>
  );
}
