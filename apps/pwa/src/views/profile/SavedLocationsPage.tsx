'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { EmptyState, LoadingState } from '@/components/ui/StateView';
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
import { positionErrorMessage, requestPosition, suggestAreaLabel, type PositionResult } from '@/lib/geolocation';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { toUserMessage } from '@/lib/supabase/errors';
import { showAppToast } from '@/lib/toast';

const SAVE_PLACE_SETTINGS_HINT = 'Allow location in your browser to save a place.';

export function SavedLocationsPage() {
  const router = useRouter();
  const saved = useMySavedLocations();
  const upsert = useUpsertSavedLocation();
  const remove = useDeleteSavedLocation();
  const [adding, setAdding] = useState(false);
  const [addLocationError, setAddLocationError] = useState<Extract<PositionResult, { ok: false }> | null>(
    null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState('');

  if (showQuerySkeleton(saved)) {
    return (
      <Screen className="min-h-[100dvh]">
        <Header title="Saved places" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  const rows = saved.isError ? [] : (saved.data ?? []);

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
  const title = savedLocationDisplayTitle(row);
    if (
      !window.confirm(`Remove saved place?\n\n“${title}” will no longer appear when you post.`)
    ) {
      return;
    }
    void remove.mutateAsync(row.saved_location_id).then(() => showAppToast('Place removed'));
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
    if (rows.length >= MAX_SAVED_LOCATIONS) {
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

    const suggestion = await suggestAreaLabel();
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

  return (
    <Screen className="min-h-[100dvh]">
      <Header title="Saved places" onBack={() => router.back()} />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pb-8">
        <p className="text-sm leading-5 text-muted">
          Saved places appear when you post a request. Others only see the rough area on each request, not this
          list.
        </p>

        {rows.length === 0 ? (
          <EmptyState
            layout="list"
            icon="location-outline"
            title="No saved places yet"
            message="Save a place when you post, or add your current location here."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row) => (
              <div key={row.saved_location_id} className="flex flex-col gap-3 rounded-2xl border border-hairline bg-elevated p-4">
                {editingId === row.saved_location_id ? (
                  <TextField
                    label="Alias (optional)"
                    value={aliasDraft}
                    onChange={(event) => setAliasDraft(event.target.value)}
                    placeholder="My home, My office…"
                  />
                ) : (
                  <div className="flex flex-row items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-ink">{savedLocationDisplayTitle(row)}</p>
                      {row.alias ? (
                        <p className="text-sm text-muted">{formatCoarseLocationLabel(row.location_label)}</p>
                      ) : null}
                    </div>
                    {row.is_default ? (
                      <span className="text-xs font-semibold uppercase text-active">Default</span>
                    ) : null}
                  </div>
                )}

                <div className="flex flex-row flex-wrap gap-2">
                  {editingId === row.saved_location_id ? (
                    <>
                      <Button label="Save alias" onClick={() => void saveAlias(row)} loading={upsert.isPending} />
                      <Button
                        label="Cancel"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(null);
                          setAliasDraft('');
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEditAlias(row)}
                        className="rounded-full bg-surface px-3 py-2 text-sm font-semibold text-ink active:opacity-90"
                      >
                        Rename
                      </button>
                      {!row.is_default ? (
                        <button
                          type="button"
                          onClick={() => void setDefault(row)}
                          className="rounded-full bg-surface px-3 py-2 text-sm font-semibold text-ink active:opacity-90"
                        >
                          Set default
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => confirmDelete(row)}
                        className="rounded-full bg-surface px-3 py-2 text-sm font-semibold text-danger active:opacity-90"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {addLocationError ? (
          <div className="rounded-xl bg-warning-soft p-4">
            <p className="text-sm leading-5 text-warning">
              {positionErrorMessage(addLocationError, SAVE_PLACE_SETTINGS_HINT)}
            </p>
          </div>
        ) : null}

        <Button
          label={adding ? 'Getting location…' : 'Add current location'}
          icon="location-outline"
          variant="secondary"
          loading={adding}
          disabled={rows.length >= MAX_SAVED_LOCATIONS}
          onClick={() => void addCurrentLocation()}
        />

        {rows.length >= MAX_SAVED_LOCATIONS ? (
          <p className="text-center text-sm text-muted">
            You can save up to {MAX_SAVED_LOCATIONS} places. Remove one to add another.
          </p>
        ) : null}
      </div>
    </Screen>
  );
}
