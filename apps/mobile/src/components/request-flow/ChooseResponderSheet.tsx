import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetWindow } from '@/components/ui/BottomSheetWindow';
import { Button } from '@/components/ui/Button';
import { chooseResponderDialog } from '@/features/requests/selection-copy';
import { useColors } from '@/theme';

export function ChooseResponderSheet({
  open,
  onClose,
  displayName,
  onConfirm,
  confirmLoading,
}: {
  open: boolean;
  onClose: () => void;
  displayName: string | null;
  onConfirm: () => void;
  confirmLoading?: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['44%'], []);
  const dialog = chooseResponderDialog(displayName);

  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.45}
        pressBehavior={confirmLoading ? 'none' : 'close'}
      />
    ),
    [confirmLoading],
  );

  const handleDismiss = () => {
    if (confirmLoading) return;
    onClose();
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      containerComponent={BottomSheetWindow}
      snapPoints={snapPoints}
      enablePanDownToClose={!confirmLoading}
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.elevated }}
      handleIndicatorStyle={{ backgroundColor: colors.hairline, width: 48, height: 4 }}
    >
      <BottomSheetView style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 12 }}>
        <View className="gap-5">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-active-soft">
            <Ionicons name="checkmark-circle-outline" size={26} color={colors.active} />
          </View>

          <View className="gap-2">
            <Text className="text-2xl font-bold leading-8 text-ink">{dialog.title}</Text>
            <Text className="text-base leading-6 text-muted">{dialog.message}</Text>
          </View>

          <View className="flex-row gap-3">
            <Button
              label={dialog.cancel}
              variant="secondary"
              size="lg"
              corner="2xl"
              className="min-w-0 flex-1"
              disabled={confirmLoading}
              onPress={onClose}
            />
            <Button
              label={dialog.confirm}
              variant="active"
              size="lg"
              corner="2xl"
              className="min-w-0 flex-1"
              loading={confirmLoading}
              onPress={onConfirm}
            />
          </View>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}