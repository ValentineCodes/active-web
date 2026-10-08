import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { MAX_PROFILE_TAG_INTERESTS } from '@/features/notifications/tag-interests';
import { useSearchTags, type RequestTag } from '@/features/requests/tags';
import { cn } from '@/lib/cn';
import { poppinsInputTypography } from '@/theme/fonts';
import { useColors } from '@/theme';

const searchTypography = poppinsInputTypography('regular', 'base');

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
    <View className="gap-4">
      {selected.length > 0 ? (
        <View className="gap-2">
          <Text className="text-sm font-semibold text-ink">Selected</Text>
          <View className="flex-row flex-wrap gap-2">
            {selected.map((tag) => (
              <View
                key={tag.id}
                className="flex-row items-center gap-1 rounded-full bg-active py-2 pl-3 pr-2"
              >
                <Text className="text-sm font-semibold text-on-brand">{tag.name}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${tag.name}`}
                  accessibilityState={{ disabled }}
                  hitSlop={8}
                  disabled={disabled}
                  onPress={() => removeTag(tag.id)}
                  className="h-7 w-7 items-center justify-center rounded-full active:opacity-80"
                >
                  <Ionicons name="close" size={18} color={colors.onBrand} />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <Text className="text-sm text-muted">No interests selected yet.</Text>
      )}

      <TextInput
        accessibilityLabel="Search tags"
        value={query}
        onChangeText={setQuery}
        placeholder="Search tags..."
        placeholderTextColor={colors.subtle}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled && !atLimit}
        className="rounded-2xl bg-surface px-4 py-4 text-ink"
        style={searchTypography}
      />

      {atLimit ? (
        <Text className="text-sm text-muted">
          You&apos;ve added {MAX_PROFILE_TAG_INTERESTS} tags. Remove one to choose a different tag.
        </Text>
      ) : null}

      <View className="flex-row flex-wrap gap-2">
        {tags.isPending ? (
          <Text className="text-sm text-muted">Loading tags…</Text>
        ) : tags.isError ? (
          <Text className="text-sm text-warning">Could not load tags.</Text>
        ) : results.length === 0 ? (
          <Text className="text-sm text-muted">
            {query.trim() ? 'No tags match your search.' : 'No tags available.'}
          </Text>
        ) : atLimit ? null : (
          results.map((tag) => (
            <Pressable
              key={tag.id}
              accessibilityRole="button"
              accessibilityLabel={`Add ${tag.name}`}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => addTag(tag)}
              className={cn(
                'rounded-full border border-hairline bg-elevated px-3 py-2 active:opacity-90',
                disabled && 'opacity-50',
              )}
            >
              <Text className="text-sm font-medium text-ink">{tag.name}</Text>
            </Pressable>
          ))
        )}
      </View>
    </View>
  );
}
