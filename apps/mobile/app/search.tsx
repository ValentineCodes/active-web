import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import {
  clearSearchRecents,
  prependSearchRecent,
  readSearchRecents,
  recordRequestSearch,
  useSearchQuerySuggestions,
} from '@/features/requests/home-search';
import { poppinsInputTypography } from '@/theme/fonts';
import { useColors } from '@/theme';

function commitHomeSearch(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return;

  void (async () => {
    await Promise.all([recordRequestSearch(trimmed), prependSearchRecent(trimmed)]);
    router.replace({
      pathname: '/(tabs)',
      params: { q: trimmed },
    });
  })();
}

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { q: initialQuery } = useLocalSearchParams<{ q?: string }>();
  const [draft, setDraft] = useState(initialQuery?.trim() ?? '');
  const [debouncedDraft, setDebouncedDraft] = useState(draft);
  const [recents, setRecents] = useState<string[]>([]);

  const suggestions = useSearchQuerySuggestions(debouncedDraft);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedDraft(draft), 300);
    return () => clearTimeout(handle);
  }, [draft]);

  useEffect(() => {
    void readSearchRecents().then(setRecents);
  }, []);

  const submit = useCallback((value: string) => {
    commitHomeSearch(value);
  }, []);

  const rows = draft.trim() ? (suggestions.data ?? []) : recents;
  const showClearRecents = !draft.trim() && recents.length > 0;
  const suggestionsPending = Boolean(draft.trim()) && suggestions.isFetching && rows.length === 0;

  return (
    <Screen edges={['bottom']}>
      <View className="flex-1" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center gap-2 px-3 pb-3 pt-2">
          <IconButton
            icon="chevron-back"
            accessibilityLabel="Back to home"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)');
            }}
          />
          <View className="min-w-0 flex-1 flex-row items-center rounded-xl bg-surface px-3 py-2">
            <TextInput
              autoFocus
              value={draft}
              onChangeText={setDraft}
              placeholder="Search Active"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              onSubmitEditing={() => submit(draft)}
              style={[poppinsInputTypography('regular', 'base'), { flex: 1, color: colors.ink }]}
              accessibilityLabel="Search Active"
            />
            {draft ? (
              <Pressable
                onPress={() => setDraft('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search text"
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={20} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {showClearRecents ? (
          <View className="flex-row justify-end px-5 pt-2">
            <Pressable
              onPress={() => {
                void clearSearchRecents().then(() => setRecents([]));
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear recent searches"
            >
              <Text className="text-sm font-semibold text-brand">Clear recents</Text>
            </Pressable>
          </View>
        ) : null}

        <FlatList
          data={rows}
          keyExtractor={(item) => item}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-5 py-2"
          ListEmptyComponent={
            suggestionsPending ? undefined : (
              <Text className="py-6 text-center text-sm text-muted">
                {draft.trim() ? 'No suggestions yet.' : 'Your recent searches will appear here.'}
              </Text>
            )
          }
          renderItem={({ item }) => (
            <View className="flex-row items-center gap-2 py-1">
              <Pressable
                onPress={() => submit(item)}
                accessibilityRole="button"
                accessibilityLabel={`Search for ${item}`}
                className="min-w-0 flex-1 flex-row items-center gap-3 py-3"
              >
                <Ionicons
                  name={draft.trim() ? 'search-outline' : 'time-outline'}
                  size={22}
                  color={colors.muted}
                />
                <Text className="flex-1 text-lg text-ink" numberOfLines={1}>
                  {item}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDraft(item)}
                accessibilityRole="button"
                accessibilityLabel={`Use ${item} as the search text`}
                hitSlop={8}
                className="p-2"
              >
                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color={colors.subtle}
                  style={{ transform: [{ rotate: '-135deg' }] }}
                />
              </Pressable>
            </View>
          )}
        />
      </View>
    </Screen>
  );
}
