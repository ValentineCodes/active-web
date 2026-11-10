'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { TagPill } from '@/components/request-flow/TagPill';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import type { TagCatalogueSection } from '@/features/requests/tag-catalogue-filter';
import type { RequestTag } from '@/features/requests/tags';

export type { TagCatalogueSection };

function normalizeQuery(query: string) {
  return query.trim().toLowerCase();
}

export function CategorizedTagPicker({
  sections,
  selected,
  maxSelected,
  onChange,
  loading,
  error,
  searchPlaceholder = 'Search tags...',
}: {
  sections: TagCatalogueSection[];
  selected: RequestTag[];
  maxSelected: number;
  onChange: (next: RequestTag[]) => void;
  loading?: boolean;
  error?: boolean;
  searchPlaceholder?: string;
}) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (loading || error) return;
    const focusTimer = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(focusTimer);
  }, [error, loading]);

  const selectedIds = useMemo(() => new Set(selected.map((tag) => tag.id)), [selected]);
  const atLimit = selected.length >= maxSelected;
  const normalizedQuery = normalizeQuery(query);

  const visibleSections = useMemo(() => {
    if (!normalizedQuery) return sections;

    return sections
      .map((section) => {
        const categoryMatches = section.category.toLowerCase().includes(normalizedQuery);
        const tags = section.tags.filter(
          (tag) =>
            categoryMatches ||
            tag.name.toLowerCase().includes(normalizedQuery) ||
            tag.slug.includes(normalizedQuery),
        );
        return tags.length > 0 ? { category: section.category, tags } : null;
      })
      .filter((section): section is TagCatalogueSection => section !== null);
  }, [normalizedQuery, sections]);

  const toggleTag = (tag: RequestTag) => {
    if (selectedIds.has(tag.id)) {
      onChange(selected.filter((item) => item.id !== tag.id));
      return;
    }
    if (atLimit) return;
    onChange([...selected, tag]);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonBlock className="h-12 w-full rounded-2xl" />
        <div className="flex flex-col gap-3">
          <SkeletonBlock className="h-5 w-40 rounded-md" />
          <div className="flex flex-row flex-wrap gap-2">
            <SkeletonBlock className="h-10 w-24 rounded-full" />
            <SkeletonBlock className="h-10 w-28 rounded-full" />
            <SkeletonBlock className="h-10 w-20 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-warning">Could not load tags.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={searchRef}
        type="search"
        aria-label="Search tags"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
        autoCapitalize="off"
        autoCorrect="off"
        className="rounded-2xl border border-hairline bg-elevated px-4 py-3.5 text-base text-ink outline-none placeholder:text-subtle"
      />

      {selected.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">Selected</p>
          <div className="flex flex-row flex-wrap gap-2">
            {selected.map((tag) => (
              <TagPill key={tag.id} label={tag.name} selected onPress={() => toggleTag(tag)} />
            ))}
          </div>
        </div>
      ) : null}

      {atLimit ? (
        <p className="text-sm text-muted">
          You&apos;ve added {maxSelected} tags. Tap one to replace it.
        </p>
      ) : null}

      <div className="max-h-96 overflow-y-auto">
        <div className="flex flex-col gap-6 pb-2">
          {visibleSections.length === 0 ? (
            <p className="text-sm text-muted">
              {normalizedQuery ? 'No tags match your search.' : 'No tags available.'}
            </p>
          ) : (
            visibleSections.map((section) => (
              <div key={section.category} className="flex flex-col gap-3">
                <p className="text-base font-bold text-ink">{section.category}</p>
                <div className="flex flex-row flex-wrap gap-2">
                  {section.tags.map((tag) => {
                    const isSelected = selectedIds.has(tag.id);
                    return (
                      <TagPill
                        key={tag.id}
                        label={tag.name}
                        selected={isSelected}
                        disabled={!isSelected && atLimit}
                        onPress={() => toggleTag(tag)}
                      />
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
