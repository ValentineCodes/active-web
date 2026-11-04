import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { EmptyState, LoadingState } from '@/components/ui/StateView';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import {
  MAX_SAVED_LOCATIONS,
  savedLocationDisplayTitle,
  savedLocationPosition,
  useDeleteSavedLocation,
  useMySavedLocations,
  useUpsertSavedLocation,
  type SavedLocation,
} from '@/features/profile/saved-locations-api';
import { formatCoarseLocationLabel } from '@/lib/format';
import {
  positionErrorMessage,
  requestPosition,
  suggestAreaLabel,
  type PositionResult,
} from '@/lib/location';
import { usePullToRefresh } from '@/lib/query/use-pull-to-refresh';
import { toUserMessage } from '@/lib/supabase/errors';
import { showAppToast } from '@/lib/toast';

const SAVE_PLACE_SETTINGS_HINT = 'Turn it on in Settings to save a place.';

export default function SavedLocationsScreen() {
  const saved = useMySavedLocations();
  useQueryErrorToast(saved);
  const upsert = useUpsertSavedLocation();
  const remove = useDeleteSavedLocation();
  const [adding, setAdding] = useState(false);
  const [addLocationError, setAddLocationError] = useState<Extract<
    PositionResult,
    { ok: false }
  > | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState('');

  const onRefresh = useCallback(async () => {
    await saved.refetch();
  }, [saved]);
  const { refreshing, onRefresh: onPullRefresh } = usePullToRefresh(onRefresh);

  const startEditAlias = (row: SavedLocation) => {
    setEditingId(row.saved_location_id);
    setAliasDraft(row.alias ?? '');
  };

  const saveAlias = async (row: SavedLocation) => {
    try {
      await upsert.mutateAsync({
        savedLocationId: row.saved_location_id,
        alias: aliasDraft.trim() || null,
        locationLabel: row.location_label,
        position: savedLocationPosition(row),
        isDefault: row.is_default,
      });
      setEditingId(null);
      setAliasDraft('');
      showAppToast('Place updated');
    } catch (error) {
      showAppToast(error instanceof Error ? error.message : 'Could not update place.', 'warning');
    }
  };

  const confirmDelete = (row: SavedLocation) => {
    Alert.alert(
      'Remove saved place?',
      `“${savedLocationDisplayTitle(row)}” will no longer appear when you post.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void remove
              .mutateAsync(row.saved_location_id)
              .then(() => showAppToast('Place removed'));
          },
        },
      ],
    );
  };

  const setDefault = async (row: SavedLocation) => {
    try {
      await upsert.mutateAsync({
        savedLocationId: row.saved_location_id,
        alias: row.alias,
        locationLabel: row.location_label,
        position: savedLocationPosition(row),
        isDefault: true,
      });
      showAppToast('Default place updated');
    } catch (error) {
      showAppToast(error instanceof Error ? error.message : 'Could not update default.', 'warning');
    }
  };

  const addCurrentLocation = async () => {
    if ((saved.data?.length ?? 0) >= MAX_SAVED_LOCATIONS) {
      showAppToast(`You can save up to ${MAX_SAVED_LOCATIONS} places.`, 'warning');
      return;
    }

    setAdding(true);
    setAddLocationError(null);

    const result = await requestPosition({ fresh: true });
    if (!result.ok) {
      setAddLocationError(result);
      setAdding(false);
      return;
    }

    const suggestion = await suggestAreaLabel(result.position);
    const locationLabel = suggestion?.trim() || 'My location';

    try {
      await upsert.mutateAsync({
        locationLabel,
        position: result.position,
      });
      setAddLocationError(null);
      showAppToast('Place saved');
    } catch (error) {
      showAppToast(toUserMessage(error), 'warning');
    } finally {
      setAdding(false);
    }
  };

  if (saved.isPending) {
    return (
      <Screen edges={['top']}>
        <Header title="Saved places" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  const rows = saved.isError ? [] : (saved.data ?? []);

  return (
    <Screen edges={['top']}>
      <Header title="Saved places" onBack={() => router.back()} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />}
      >
        <Text className="text-sm leading-5 text-muted">
          Saved places appear when you post a request. Others only see the rough area on each
          request, not this list.
        </Text>

        {rows.length === 0 ? (
          <EmptyState
            layout="list"
            icon="location-outline"
            title="No saved places yet"
            message="Save a place when you post, or add your current location here."
          />
        ) : (
          <View className="gap-3">
            {rows.map((row) => (
              <View
                key={row.saved_location_id}
                className="gap-3 rounded-2xl border border-hairline bg-elevated p-4"
              >
                {editingId === row.saved_location_id ? (
                  <TextField
                    label="Alias (optional)"
                    value={aliasDraft}
                    onChangeText={setAliasDraft}
                    placeholder="My home, My office…"
                  />
                ) : (
                  <>
                    <View className="flex-row items-start justify-between gap-2">
                      <View className="min-w-0 flex-1 gap-0.5">
                        <Text className="text-lg font-semibold text-ink">
                          {savedLocationDisplayTitle(row)}
                        </Text>
                        {row.alias ? (
                          <Text className="text-sm text-muted">
                            {formatCoarseLocationLabel(row.location_label)}
                          </Text>
                        ) : null}
                      </View>
                      {row.is_default ? (
                        <Text className="text-xs font-semibold uppercase text-active">Default</Text>
                      ) : null}
                    </View>
                  </>
                )}

                <View className="flex-row flex-wrap gap-2">
                  {editingId === row.saved_location_id ? (
                    <>
                      <Button
                        label="Save alias"
                        size="md"
                        onPress={() => void saveAlias(row)}
                        loading={upsert.isPending}
                      />
                      <Button
                        label="Cancel"
                        size="md"
                        variant="ghost"
                        onPress={() => {
                          setEditingId(null);
                          setAliasDraft('');
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => startEditAlias(row)}
                        className="rounded-full bg-surface px-3 py-2"
                      >
                        <Text className="text-sm font-semibold text-ink">Rename</Text>
                      </Pressable>
                      {!row.is_default ? (
                        <Pressable
                          onPress={() => void setDefault(row)}
                          className="rounded-full bg-surface px-3 py-2"
                        >
                          <Text className="text-sm font-semibold text-ink">Set default</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => confirmDelete(row)}
                        className="rounded-full bg-surface px-3 py-2"
                      >
                        <Text className="text-sm font-semibold text-danger">Remove</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {addLocationError ? (
          <View className="gap-3 rounded-xl bg-warning-soft p-4">
            <Text className="text-sm leading-5 text-warning">
              {positionErrorMessage(addLocationError, SAVE_PLACE_SETTINGS_HINT)}
            </Text>
            {addLocationError.reason === 'permission-denied' ? (
              <Button
                label="Open settings"
                variant="secondary"
                onPress={() => Linking.openSettings()}
              />
            ) : null}
          </View>
        ) : null}

        <Button
          label={adding ? 'Getting location…' : 'Add current location'}
          icon="locate"
          variant="secondary"
          loading={adding}
          disabled={(rows.length ?? 0) >= MAX_SAVED_LOCATIONS}
          onPress={() => void addCurrentLocation()}
        />

        {(rows.length ?? 0) >= MAX_SAVED_LOCATIONS ? (
          <Text className="text-center text-sm text-muted">
            You can save up to {MAX_SAVED_LOCATIONS} places. Remove one to add another.
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
