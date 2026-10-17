import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetWindow } from '@/components/ui/BottomSheetWindow';
import { Button } from '@/components/ui/Button';
import { useColors } from '@/theme';

export type ExtendResponseDeadlineSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  deadlineDateLabel: string;
  deadlineTimeLabel: string;
  onRequestDatePicker: () => void;
  onRequestTimePicker: () => void;
  onDismiss?: () => void;
  onExtend: () => void;
  extendLoading: boolean;
};

export const ExtendResponseDeadlineSheet = forwardRef<ExtendResponseDeadlineSheetHandle, Props>(
  function ExtendResponseDeadlineSheet(
    {
      deadlineDateLabel,
      deadlineTimeLabel,
      onRequestDatePicker,
      onRequestTimePicker,
      onDismiss,
      onExtend,
      extendLoading,
    },
    ref,
  ) {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['48%'], []);

    useImperativeHandle(ref, () => ({
      present: () => {
        sheetRef.current?.present();
      },
      dismiss: () => {
        sheetRef.current?.dismiss();
      },
    }));

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.45}
          pressBehavior={extendLoading ? 'none' : 'close'}
        />
      ),
      [extendLoading],
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        containerComponent={BottomSheetWindow}
        snapPoints={snapPoints}
        enablePanDownToClose={!extendLoading}
        onDismiss={onDismiss}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.elevated }}
        handleIndicatorStyle={{ backgroundColor: colors.hairline, width: 48, height: 4 }}
      >
        <BottomSheetView
          style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 20 }}
        >
          <View className="gap-5">
            <View className="gap-2">
              <Text className="text-xl font-bold text-ink">New response deadline</Text>
              <Text className="text-base text-muted">
                People nearby can respond again until this time. Your task date stays the same.
              </Text>
            </View>

            <View className="flex-row gap-3">
              <Button
                label={deadlineDateLabel}
                variant="secondary"
                className="flex-1"
                disabled={extendLoading}
                onPress={onRequestDatePicker}
              />
              <Button
                label={deadlineTimeLabel}
                variant="secondary"
                className="flex-1"
                disabled={extendLoading}
                onPress={onRequestTimePicker}
              />
            </View>

            <View className="flex-row gap-3">
              <Button
                label="Cancel"
                variant="secondary"
                className="flex-1"
                disabled={extendLoading}
                onPress={() => sheetRef.current?.dismiss()}
              />
              <Button
                label="Extend"
                className="flex-1"
                size="lg"
                onPress={onExtend}
                loading={extendLoading}
              />
            </View>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
