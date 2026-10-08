import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { TagPill } from '@/components/request-flow/TagPill';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import type { RequestTag } from '@/features/requests/tags';
import { poppinsInputTypography } from '@/theme/fonts';
import { useColors } from '@/theme';

const searchTypography = poppinsInputTypography('regular', 'base');

export type TagCatalogueSection = {
  category: string;
  tags: RequestTag[];
};

type CategorizedTagPickerProps = {
  sections: TagCatalogueSection[];
  selected: RequestTag[];
  maxSelected: number;
  onChange: (next: RequestTag[]) => void;
  loading?: boolean;
  error?: boolean;
  searchPlaceholder?: string;
};

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
}: CategorizedTagPickerProps) {
  const colors = useColors();
  const [query, setQuery] = useState('');

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
      <View className="gap-4">
        <SkeletonBlock className="h-12 w-full rounded-2xl" />
        <View className="gap-3">
          <SkeletonBlock className="h-5 w-40 rounded-md" />
          <View className="flex-row flex-wrap gap-2">
            <SkeletonBlock className="h-10 w-24 rounded-full" />
            <SkeletonBlock className="h-10 w-28 rounded-full" />
            <SkeletonBlock className="h-10 w-20 rounded-full" />
          </View>
        </View>
      </View>
    );
  }

  if (error) {
    return <Text className="text-sm text-warning">Could not load tags.</Text>;
  }

  return (
    <View className="gap-4">
      <TextInput
        accessibilityLabel="Search tags"
        value={query}
        onChangeText={setQuery}
        placeholder={searchPlaceholder}
        placeholderTextColor={colors.subtle}
        autoCapitalize="none"
        autoCorrect={false}
        className="rounded-2xl border border-hairline bg-elevated px-4 py-3.5 text-ink"
        style={searchTypography}
      />

      {selected.length > 0 ? (
        <View className="gap-2">
          <Text className="text-sm font-semibold text-ink">Selected</Text>
          <View className="flex-row flex-wrap gap-2">
            {selected.map((tag) => (
              <TagPill key={tag.id} label={tag.name} selected onPress={() => toggleTag(tag)} />
            ))}
          </View>
        </View>
      ) : null}

      {atLimit ? (
        <Text className="text-sm text-muted">
          You&apos;ve added {maxSelected} tags. Tap one to replace it.
        </Text>
      ) : null}

      <ScrollView
        className="max-h-96"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
      >
        <View className="gap-6 pb-2">
          {visibleSections.length === 0 ? (
            <Text className="text-sm text-muted">
              {normalizedQuery ? 'No tags match your search.' : 'No tags available.'}
            </Text>
          ) : (
            visibleSections.map((section) => (
              <View key={section.category} className="gap-3">
                <Text className="text-base font-bold text-ink">{section.category}</Text>
                <View className="flex-row flex-wrap gap-2">
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
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

export function groupTagsByCategory(tags: RequestTag[]): TagCatalogueSection[] {
  const byCategory = new Map<string, RequestTag[]>();

  for (const tag of tags) {
    const list = byCategory.get(tag.category) ?? [];
    list.push(tag);
    byCategory.set(tag.category, list);
  }

  return [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, categoryTags]) => ({
      category,
      tags: categoryTags.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
