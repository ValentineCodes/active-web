import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetWindow } from '@/components/ui/BottomSheetWindow';
import { useColors } from '@/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type ConversationAttachmentSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type AttachmentOption = 'photo' | 'video' | 'file';

function AttachmentOptionRow({
  icon,
  label,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-row items-center gap-4 rounded-2xl py-3 active:opacity-80"
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-active-soft">
        <Ionicons name={icon} size={22} color={colors.active} />
      </View>
      <Text className="text-base font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}

export const ConversationAttachmentSheet = forwardRef<
  ConversationAttachmentSheetHandle,
  {
    onSelect: (option: AttachmentOption) => void;
  }
>(function ConversationAttachmentSheet({ onSelect }, ref) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['32%'], []);

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
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.45} />
    ),
    [],
  );

  const choose = (option: AttachmentOption) => {
    sheetRef.current?.dismiss();
    onSelect(option);
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      containerComponent={BottomSheetWindow}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.elevated }}
      handleIndicatorStyle={{ backgroundColor: colors.hairline, width: 48, height: 4 }}
    >
      <BottomSheetView
        style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: insets.bottom + 16 }}
      >
        <View className="gap-1">
          <AttachmentOptionRow
            icon="camera-outline"
            label="Take photo"
            onPress={() => choose('photo')}
          />
          <AttachmentOptionRow
            icon="videocam-outline"
            label="Record video"
            onPress={() => choose('video')}
          />
          <AttachmentOptionRow
            icon="folder-open-outline"
            label="Choose file to upload"
            onPress={() => choose('file')}
          />
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});
