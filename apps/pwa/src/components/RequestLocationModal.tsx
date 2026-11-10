'use client';

import { Drawer } from 'vaul';

import { Button } from '@/components/ui/Button';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import {
  savedLocationDisplayTitle,
  type SavedLocation,
} from '@/features/profile/saved-locations-api';
import { formatCoarseLocationLabel } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme/ThemeProvider';

/**
 * Nested Vaul drawer — must render inside the create composer `Drawer.Root`
 * so it stacks and receives pointer events above the wizard.
 */
export function RequestLocationModal({
  open,
  onClose,
  loading,
  errorMessage,
  locationPermissionDenied = false,
  savedPlaces = [],
  savedPlacesLoading = false,
  saveForFuture = false,
  onSaveForFutureChange,
  showSaveForFuture = true,
  title = 'Where do you need help?',
  body = 'Pick a saved place or share your current location. Others only see a rough area until you choose someone.',
  onSelectSavedPlace,
  onShareLocation,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  errorMessage: string | null;
  locationPermissionDenied?: boolean;
  savedPlaces?: SavedLocation[];
  savedPlacesLoading?: boolean;
  saveForFuture?: boolean;
  onSaveForFutureChange?: (value: boolean) => void;
  showSaveForFuture?: boolean;
  title?: string;
  body?: string;
  onSelectSavedPlace: (place: SavedLocation) => void;
  onShareLocation: () => void;
}) {
  const colors = useColors();
  const hasSavedPlaces = savedPlaces.length > 0;
  const permissionBlocked = locationPermissionDenied || errorMessage?.includes('Settings');
  const dismissible = !loading;

  return (
    <Drawer.NestedRoot
      open={open}
      dismissible={dismissible}
      onOpenChange={(next) => {
        if (!next && dismissible) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[100] bg-black/45" />
        <Drawer.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-[100] mx-auto flex w-full max-w-lg flex-col rounded-t-3xl border border-hairline bg-elevated shadow-raised outline-none',
            'max-h-[min(90dvh,640px)]',
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-hairline" aria-hidden />
          <div className="overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex flex-col gap-5">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-active-soft">
                <IonIcon icon={ionIcons['location-outline']} size={28} color={colors.active} />
              </span>

              <div className="flex flex-col gap-2">
                <Drawer.Title className="text-2xl font-bold leading-8 text-ink">{title}</Drawer.Title>
                <Drawer.Description className="text-base leading-6 text-muted">{body}</Drawer.Description>
              </div>

              {hasSavedPlaces ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Saved places</p>
                  {savedPlaces.map((place) => (
                    <button
                      key={place.saved_location_id}
                      type="button"
                      disabled={loading}
                      onClick={() => onSelectSavedPlace(place)}
                      className="rounded-2xl border border-hairline bg-surface px-4 py-3 text-left active:opacity-90 disabled:opacity-50"
                    >
                      <p className="text-base font-semibold text-ink">{savedLocationDisplayTitle(place)}</p>
                      {place.alias ? (
                        <p className="mt-0.5 text-sm text-muted">
                          {formatCoarseLocationLabel(place.location_label)}
                        </p>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : savedPlacesLoading ? (
                <p className="text-sm text-muted">Loading saved places…</p>
              ) : null}

              {showSaveForFuture ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onSaveForFutureChange?.(!saveForFuture)}
                  className="flex flex-row items-center gap-3 py-1 text-left active:opacity-90 disabled:opacity-50"
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded border ${
                      saveForFuture ? 'border-active bg-active' : 'border-hairline bg-elevated'
                    }`}
                  >
                    {saveForFuture ? <span className="text-xs font-bold text-elevated">✓</span> : null}
                  </span>
                  <span className="flex-1 text-sm text-ink">Save for future requests</span>
                </button>
              ) : null}

              {errorMessage && !loading ? (
                <p className="text-sm leading-5 text-warning">{errorMessage}</p>
              ) : null}

              <div className="flex flex-col gap-3">
                <Button
                  label={
                    loading
                      ? 'Getting location…'
                      : permissionBlocked
                        ? 'Turn on location in browser settings'
                        : 'Share location'
                  }
                  variant="active"
                  size="lg"
                  loading={loading}
                  icon={permissionBlocked ? 'settings-outline' : 'navigate-outline'}
                  onClick={permissionBlocked ? onClose : onShareLocation}
                />
                <Button label="Not now" variant="ghost" onClick={onClose} disabled={loading} />
              </div>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.NestedRoot>
  );
}
