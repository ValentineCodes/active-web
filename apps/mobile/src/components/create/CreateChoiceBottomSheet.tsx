import { useCallback, useMemo, type RefObject } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetWindow } from '@/components/ui/BottomSheetWindow';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme';

type CreateChoice = 'request' | 'project';

export type CreateChoiceBottomSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

function CreateOptionCard({
  title,
  description,
  icon,
  onPress,
}: {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      onPress={onPress}
      className="flex-1 gap-2 rounded-2xl border border-hairline bg-surface p-4 active:opacity-90"
    >
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-active-soft">
        <Ionicons name={icon} size={24} color={colors.active} />
      </View>
      <Text className="text-lg font-bold text-ink">{title}</Text>
      <Text className="text-sm leading-5 text-muted">{description}</Text>
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
  const snapPoints = useMemo(() => [280 + insets.bottom], [insets.bottom]);

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
        <View className="gap-1">
          <Text className="text-2xl font-bold text-ink">Create</Text>
          <Text className="text-base text-muted">Choose what you want to post on Active.</Text>
        </View>
        <View className="flex-row gap-3">
          <CreateOptionCard
            title="Request"
            description="Find someone to do one job for you."
            icon="document-text-outline"
            onPress={() => onChoose('request')}
          />
          <CreateOptionCard
            title="Project"
            description="Raise funds and coordinate multiple workers."
            icon="people-outline"
            onPress={() => onChoose('project')}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={() => sheetRef.current?.dismiss()}
          className={cn('items-center py-2 active:opacity-80')}
        >
          <Text className="text-base font-semibold text-muted">Cancel</Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheetModal>
  );
}