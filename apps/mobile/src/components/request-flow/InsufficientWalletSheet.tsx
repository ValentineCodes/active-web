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
import { useColors } from '@/theme';

export function InsufficientWalletSheet({
  open,
  onClose,
  message,
  onAddMoney,
}: {
  open: boolean;
  onClose: () => void;
  message: string;
  onAddMoney: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['44%'], []);

  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.45} />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      containerComponent={BottomSheetWindow}
      snapPoints={snapPoints}
      enablePanDownToClose
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.elevated }}
      handleIndicatorStyle={{ backgroundColor: colors.hairline, width: 48, height: 4 }}
    >
      <BottomSheetView style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 12 }}>
        <View className="gap-5">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-warning-soft">
            <Ionicons name="wallet-outline" size={26} color={colors.warning} />
          </View>

          <View className="gap-2">
            <Text className="text-2xl font-bold leading-8 text-ink">Oops!... You're Broke</Text>
            <Text className="text-base leading-6 text-muted">{message}</Text>
          </View>

          <View className="flex-row gap-3">
            <Button
              label="Not now"
              variant="secondary"
              size="lg"
              corner="2xl"
              className="min-w-0 flex-1"
              onPress={onClose}
            />
            <Button
              label="Add money"
              variant="active"
              size="lg"
              corner="2xl"
              className="min-w-0 flex-1"
              onPress={onAddMoney}
            />
          </View>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}