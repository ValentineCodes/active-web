import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetFlatList,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetWindow } from '@/components/ui/BottomSheetWindow';
import type { PaystackBankOption } from '@/features/profile/bank-accounts-api';
import { poppinsInputTypography } from '@/theme/fonts';
import { useColors } from '@/theme';

export type BankPickerSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  banks: PaystackBankOption[];
  loading: boolean;
  errorMessage: string | null;
  selectedCode: string | null;
  onSelect: (bank: PaystackBankOption) => void;
  onDismiss: () => void;
};

const SHEET_VERTICAL_MARGIN = 8;

export const BankPickerSheet = forwardRef<BankPickerSheetHandle, Props>(function BankPickerSheet(
  { banks, loading, errorMessage, selectedCode, onSelect, onDismiss },
  ref,
) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [query, setQuery] = useState('');
  const fieldTypography = poppinsInputTypography('regular', 'base');

  const snapPoints = useMemo(() => {
    const maxHeight = Math.floor(windowHeight - insets.top - insets.bottom - SHEET_VERTICAL_MARGIN);
    const preferred = Math.floor(windowHeight * 0.75);
    return [Math.min(preferred, maxHeight)];
  }, [insets.bottom, insets.top, windowHeight]);

  useImperativeHandle(ref, () => ({
    present: () => {
      setQuery('');
      sheetRef.current?.present();
    },
    dismiss: () => {
      sheetRef.current?.dismiss();
    },
  }));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return banks;
    return banks.filter((bank) => bank.name.toLowerCase().includes(q));
  }, [banks, query]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    [],
  );

  const listHeader = useMemo(
    () => (
      <View className="gap-3 px-5 pb-2 pt-1">
        <Text className="text-xl font-bold text-ink">Select bank</Text>
        <View className="flex-row items-center gap-2 rounded-2xl bg-surface px-4 py-3">
          <Ionicons name="search" size={18} color={colors.subtle} />
          <TextInput
            accessibilityLabel="Search banks"
            placeholder="Search banks"
            placeholderTextColor={colors.subtle}
            value={query}
            onChangeText={setQuery}
            className="flex-1 text-ink"
            style={fieldTypography}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      </View>
    ),
    [colors.subtle, fieldTypography, query],
  );

  const listEmpty = useMemo(() => {
    if (loading) {
      return (
        <View className="items-center justify-center py-12">
          <ActivityIndicator color={colors.active} />
        </View>
      );
    }
    if (errorMessage) {
      return (
        <View className="px-5 py-8">
          <Text className="text-center text-base text-danger">{errorMessage}</Text>
        </View>
      );
    }
    return (
      <Text className="px-5 py-8 text-center text-base text-muted">
        No banks match your search.
      </Text>
    );
  }, [colors.active, errorMessage, loading]);

  const listData = loading || errorMessage ? [] : filtered;

  return (
    <BottomSheetModal
      ref={sheetRef}
      containerComponent={BottomSheetWindow}
      topInset={insets.top}
      bottomInset={insets.bottom}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableOverDrag={false}
      backdropComponent={renderBackdrop}
      onDismiss={onDismiss}
      handleIndicatorStyle={{ backgroundColor: colors.hairline, width: 48, height: 4 }}
      backgroundStyle={{ backgroundColor: colors.elevated }}
    >
      <BottomSheetFlatList
        data={listData}
        keyExtractor={(item) => `${item.code}:${item.name}`}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const selected = item.code === selectedCode;
          return (
            <Pressable
              onPress={() => {
                onSelect(item);
                sheetRef.current?.dismiss();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className="flex-row items-center justify-between px-5 py-4 active:opacity-90"
            >
              <Text className="flex-1 text-lg text-ink">{item.name}</Text>
              {selected ? <Ionicons name="checkmark" size={22} color={colors.active} /> : null}
            </Pressable>
          );
        }}
      />
    </BottomSheetModal>
  );
});
