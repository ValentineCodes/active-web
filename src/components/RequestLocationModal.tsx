import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Linking, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { BottomSheetWindow } from '@/components/ui/BottomSheetWindow';
import { useColors } from '@/theme';

export type RequestLocationSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type RequestLocationModalProps = {
  loading: boolean;
  errorMessage: string | null;
  title?: string;
  body?: string;
  onDismiss: () => void;
  onShareLocation: () => void;
};

export const RequestLocationModal = forwardRef<
  RequestLocationSheetHandle,
  RequestLocationModalProps
>(function RequestLocationModal(
  {
    loading,
    errorMessage,
    title = 'Location needed to post',
    body = 'We use your location to match your request with people nearby. Nobody sees your exact address — only a rough area — until you pick someone to help.',
    onDismiss,
    onShareLocation,
  },
  ref,
) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['54%'], []);
  const permissionBlocked = errorMessage?.includes('Settings');

  useImperativeHandle(ref, () => ({
    present: () => {
      sheetRef.current?.present();
    },
    dismiss: () => {
      sheetRef.current?.dismiss();
    },
  }));

  const handleSheetDismiss = useCallback(() => {
    if (loading) return;
    onDismiss();
  }, [loading, onDismiss]);

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
      <BottomSheetView
        style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 20 }}
      >
        <View className="gap-5">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-active-soft">
            <Ionicons name="location-outline" size={28} color={colors.active} />
          </View>

          <View className="gap-2">
            <Text className="font-serif text-2xl font-bold leading-8 text-ink">{title}</Text>
            <Text className="text-base leading-6 text-muted">{body}</Text>
          </View>

          {errorMessage ? (
            <Text className="text-sm leading-5 text-warning">{errorMessage}</Text>
          ) : null}

          <View className="gap-3">
            <Button
              label={loading ? 'Getting location…' : 'Share location'}
              variant="active"
              size="lg"
              loading={loading}
              icon="locate"
              onPress={onShareLocation}
            />
            {permissionBlocked ? (
              <Button
                label="Open settings"
                variant="secondary"
                onPress={() => Linking.openSettings()}
              />
            ) : null}
            <Button
              label="Not now"
              variant="ghost"
              onPress={() => sheetRef.current?.dismiss()}
              disabled={loading}
            />
          </View>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});
