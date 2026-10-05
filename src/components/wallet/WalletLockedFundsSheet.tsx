import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetWindow } from '@/components/ui/BottomSheetWindow';
import { Button } from '@/components/ui/Button';
import type { WalletLockedCommitment } from '@/features/wallet/locked-commitments';
import { formatMoney } from '@/lib/format';
import { useColors } from '@/theme';

export type WalletLockedFundsSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  lockedTotal: number;
  currency: string;
  commitments: WalletLockedCommitment[];
};

export const WalletLockedFundsSheet = forwardRef<WalletLockedFundsSheetHandle, Props>(
  function WalletLockedFundsSheet({ lockedTotal, currency, commitments }, ref) {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['58%'], []);

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

    const primaryCommitment = commitments[0];

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
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: insets.bottom + 20,
            gap: 20,
          }}
        >
          <View className="h-12 w-12 items-center justify-center rounded-full bg-warning-soft">
            <Ionicons name="time-outline" size={24} color={colors.warning} />
          </View>

          <View className="gap-3">
            <Text className="text-2xl font-bold leading-8 text-ink">About locked money</Text>
            <Text className="text-base leading-6 text-muted">
              {formatMoney(lockedTotal, currency)} is set aside for an active request. It is still
              part of your total balance, but you can&apos;t use it for another request right now.
            </Text>
          </View>

          {primaryCommitment ? (
            <View className="flex-row items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-4">
              <Text className="flex-1 text-base text-muted" numberOfLines={2}>
                {primaryCommitment.title}
              </Text>
              <Text className="text-base font-semibold text-ink">
                {formatMoney(primaryCommitment.amount, primaryCommitment.currency)}
              </Text>
            </View>
          ) : null}

          {commitments.length > 1 ? (
            <View className="gap-2">
              {commitments.slice(1).map((commitment) => (
                <View
                  key={commitment.requestId}
                  className="flex-row items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3"
                >
                  <Text className="flex-1 text-sm text-muted" numberOfLines={2}>
                    {commitment.title}
                  </Text>
                  <Text className="text-sm font-semibold text-ink">
                    {formatMoney(commitment.amount, commitment.currency)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text className="text-sm leading-5 text-muted">
            When the request is completed, the money is paid to the person who helped. If it is
            cancelled, the money returns to your available balance.
          </Text>

          <Button
            label="Got it"
            variant="secondary"
            size="lg"
            corner="2xl"
            onPress={() => sheetRef.current?.dismiss()}
          />
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);
