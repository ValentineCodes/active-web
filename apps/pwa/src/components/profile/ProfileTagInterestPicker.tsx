'use client';

import { useState } from 'react';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { MAX_PROFILE_TAG_INTERESTS } from '@/features/notifications/tag-interests';
import { useSearchTags, type RequestTag } from '@/features/requests/tags';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme/ThemeProvider';

type ProfileTagInterestPickerProps = {
  selected: RequestTag[];
  onChange: (next: RequestTag[]) => void;
  disabled?: boolean;
};

export function ProfileTagInterestPicker({
  selected,
  onChange,
  disabled,
}: ProfileTagInterestPickerProps) {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const tags = useSearchTags(query);

  const selectedIds = new Set(selected.map((tag) => tag.id));
  const atLimit = selected.length >= MAX_PROFILE_TAG_INTERESTS;

  const setSelected = (next: RequestTag[]) => {
    onChange(next.slice(0, MAX_PROFILE_TAG_INTERESTS));
  };

  const removeTag = (tagId: string) => {
    if (disabled) return;
    setSelected(selected.filter((item) => item.id !== tagId));
  };

  const addTag = (tag: RequestTag) => {
    if (disabled || atLimit || selectedIds.has(tag.id)) return;
    setSelected([...selected, tag]);
  };

  const results = (tags.data ?? []).filter((tag) => !selectedIds.has(tag.id));

  return (
    <div className="flex flex-col gap-4">
      {selected.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">Selected</p>
          <div className="flex flex-row flex-wrap gap-2">
            {selected.map((tag) => (
              <div
                key={tag.id}
                className="flex flex-row items-center gap-1 rounded-full bg-active py-2 pl-3 pr-1"
              >
                <span className="text-sm font-semibold text-on-brand">{tag.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${tag.name}`}
                  disabled={disabled}
                  onClick={() => removeTag(tag.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-full active:opacity-80 disabled:opacity-50"
                >
                  <IonIcon icon={ionIcons.close} size={18} color={colors.onBrand} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <input
        type="search"
        aria-label="Search tags"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search tags..."
        autoCapitalize="off"
        autoCorrect="off"
        disabled={disabled || atLimit}
        className="rounded-2xl bg-surface px-4 py-4 text-base text-ink outline-none placeholder:text-subtle disabled:opacity-50"
      />

      {atLimit ? (
        <p className="text-sm text-muted">
          You&apos;ve added {MAX_PROFILE_TAG_INTERESTS} tags. Remove one to choose a different tag.
        </p>
      ) : null}

      <div className="flex flex-row flex-wrap gap-2">
        {tags.isPending ? (
          <p className="text-sm text-muted">Loading tags…</p>
        ) : tags.isError ? (
          <p className="text-sm text-warning">Could not load tags.</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-muted">
            {query.trim() ? 'No tags match your search.' : 'No tags available.'}
          </p>
        ) : atLimit ? null : (
          results.map((tag) => (
            <button
              key={tag.id}
              type="button"
              disabled={disabled}
              onClick={() => addTag(tag)}
              className={cn(
                'rounded-full border border-hairline bg-elevated px-3 py-2 text-sm font-medium text-ink active:opacity-90',
                disabled && 'opacity-50',
              )}
            >
              {tag.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
}