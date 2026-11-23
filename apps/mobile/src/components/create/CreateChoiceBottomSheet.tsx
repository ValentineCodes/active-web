import { useCallback, useMemo, type ReactNode, type RefObject } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { FontAwesome6, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetWindow } from '@/components/ui/BottomSheetWindow';
import { useColors } from '@/theme';

type CreateChoice = 'request' | 'project';

function CreateOptionCard({
  title,
  caption,
  icon,
  onPress,
}: {
  title: string;
  caption: string;
  icon: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={caption}
      onPress={onPress}
      className="min-w-0 flex-1 gap-2 rounded-2xl border border-hairline bg-surface p-4 active:opacity-90"
    >
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-active-soft">
        {icon}
      </View>
      <Text className="text-base font-semibold text-ink">{title}</Text>
      <Text className="text-sm leading-5 text-muted">{caption}</Text>
    </Pressable>
  );
}

export function CreateChoiceBottomSheet({
  sheetRef,
  onChoose,
  onDismiss,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  onChoose: (choice: CreateChoice) => void;
  onDismiss: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const snapPoints = useMemo(() => [252 + insets.bottom], [insets.bottom]);

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
      backdropComponent={renderBackdrop}
      onDismiss={onDismiss}
      backgroundStyle={{ backgroundColor: colors.elevated }}
      handleIndicatorStyle={{ backgroundColor: colors.hairline, width: 48, height: 4 }}
      accessibilityViewIsModal
    >
      <BottomSheetView
        style={{ paddingBottom: Math.max(insets.bottom, 16), paddingHorizontal: 20, gap: 16 }}
      >
        <Text className="text-xl font-semibold text-ink">What do you need?</Text>
        <View className="flex-row gap-3">
          <CreateOptionCard
            title="Ask for help"
            caption="One job, one helper nearby"
            icon={
              <FontAwesome6 name="handshake" iconStyle="regular" size={22} color={colors.active} />
            }
            onPress={() => onChoose('request')}
          />
          <CreateOptionCard
            title="Start a project"
            caption="Raise money and bring in workers"
            icon={<Ionicons name="people-outline" size={24} color={colors.active} />}
            onPress={() => onChoose('project')}
          />
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}