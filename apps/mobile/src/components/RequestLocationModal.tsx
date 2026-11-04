import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { BottomSheetWindow } from '@/components/ui/BottomSheetWindow';
import type { SavedLocation } from '@/features/profile/saved-locations-api';
import { savedLocationDisplayTitle } from '@/features/profile/saved-locations-api';
import { formatCoarseLocationLabel } from '@/lib/format';
import { useColors } from '@/theme';

export type RequestLocationSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type RequestLocationModalProps = {
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
  onDismiss: () => void;
  onSelectSavedPlace: (place: SavedLocation) => void;
  onShareLocation: () => void;
};

export const RequestLocationModal = forwardRef<
  RequestLocationSheetHandle,
  RequestLocationModalProps
>(function RequestLocationModal(
  {
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
    onDismiss,
    onSelectSavedPlace,
    onShareLocation,
  },
  ref,
) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const hasSavedPlaces = savedPlaces.length > 0;
  const snapPoints = useMemo(() => (hasSavedPlaces ? ['72%'] : ['58%']), [hasSavedPlaces]);
  const permissionBlocked = locationPermissionDenied || errorMessage?.includes('Settings');

  useImperativeHandle(ref, () => ({
    present: () => {
      sheetRef.current?.present();
    },
    dismiss: () => {
      sheetRef.current?.dismiss();
    },
  }));

  const handleSheetDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.45}
        pressBehavior={loading ? 'none' : 'close'}
      />
    ),
    [loading],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      containerComponent={BottomSheetWindow}
      snapPoints={snapPoints}
      enablePanDownToClose={!loading}
      onDismiss={handleSheetDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.elevated }}
      handleIndicatorStyle={{ backgroundColor: colors.hairline, width: 48, height: 4 }}
    >
      <BottomSheetScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: insets.bottom + 20,
        }}
      >
        <View className="gap-5">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-active-soft">
            <Ionicons name="location-outline" size={28} color={colors.active} />
          </View>

          <View className="gap-2">
            <Text className="text-2xl font-bold leading-8 text-ink">{title}</Text>
            <Text className="text-base leading-6 text-muted">{body}</Text>
          </View>

          {hasSavedPlaces ? (
            <View className="gap-2">
              <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
                Saved places
              </Text>
              {savedPlaces.map((place) => (
                <Pressable
                  key={place.saved_location_id}
                  onPress={() => onSelectSavedPlace(place)}
                  disabled={loading}
                  accessibilityRole="button"
                  className="rounded-2xl border border-hairline bg-surface px-4 py-3 active:opacity-90"
                >
                  <Text className="text-base font-semibold text-ink">
                    {savedLocationDisplayTitle(place)}
                  </Text>
                  {place.alias ? (
                    <Text className="mt-0.5 text-sm text-muted">
                      {formatCoarseLocationLabel(place.location_label)}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : savedPlacesLoading ? (
            <Text className="text-sm text-muted">Loading saved places…</Text>
          ) : null}

          {showSaveForFuture ? (
            <Pressable
              onPress={() => onSaveForFutureChange?.(!saveForFuture)}
              disabled={loading}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: saveForFuture }}
              className="flex-row items-center gap-3 py-1"
            >
              <View
                className={`h-5 w-5 items-center justify-center rounded border ${
                  saveForFuture ? 'border-active bg-active' : 'border-hairline bg-elevated'
                }`}
              >
                {saveForFuture ? (
                  <Ionicons name="checkmark" size={14} color={colors.elevated} />
                ) : null}
              </View>
              <Text className="flex-1 text-sm text-ink">Save for future requests</Text>
            </Pressable>
          ) : null}

          {errorMessage && !loading ? (
            <Text className="text-sm leading-5 text-warning">{errorMessage}</Text>
          ) : null}

          <View className="gap-3">
            <Button
              label={
                loading
                  ? 'Getting location…'
                  : permissionBlocked
                    ? 'Open settings'
                    : 'Share location'
              }
              variant="active"
              size="lg"
              loading={loading}
              icon={permissionBlocked ? 'settings-outline' : 'locate'}
              onPress={permissionBlocked ? () => Linking.openSettings() : onShareLocation}
            />
            <Button
              label="Not now"
              variant="ghost"
              onPress={() => sheetRef.current?.dismiss()}
              disabled={loading}
            />
          </View>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});
