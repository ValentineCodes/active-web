import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetWindow } from '@/components/ui/BottomSheetWindow';
import { Button } from '@/components/ui/Button';
import { KeyboardStickyFooter } from '@/components/ui/KeyboardStickyFooter';
import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { MARKET } from '@/config';
import { projectContributionAmountPresets } from '@/features/projects/project-contribute';
import { useContributeToProject } from '@/features/projects/project-api';
import { useMyWallet } from '@/features/wallet/api';
import { walletLockShortfallMajor } from '@/features/wallet/top-up';
import { formatMoney } from '@/lib/format';
import { isInsufficientWalletBalanceError, toUserMessage } from '@/lib/supabase/errors';
import { showAppToast } from '@/lib/toast';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme';

const INSUFFICIENT_WALLET_MESSAGE =
  'You don\u2019t have enough available money in your wallet. Add money, then try contributing again.';

export type ProjectContributeInsufficientWalletPrompt = {
  message: string;
  requiredLockMajor: number;
};

export type ProjectContributeSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type ProjectContributeSheetProps = {
  projectId: string;
  minContributionMajor: number;
  maxContributionMajor: number;
  projectTitle: string;
  onInsufficientWallet: (prompt: ProjectContributeInsufficientWalletPrompt) => void;
};

export const ProjectContributeSheet = forwardRef<
  ProjectContributeSheetHandle,
  ProjectContributeSheetProps
>(function ProjectContributeSheet(
  { projectId, minContributionMajor, maxContributionMajor, projectTitle, onInsufficientWallet },
  ref,
) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['62%'], []);
  const [amount, setAmount] = useState('');
  const contribute = useContributeToProject();
  const wallet = useMyWallet();
  const amountPresets = useMemo(
    () => projectContributionAmountPresets(minContributionMajor, maxContributionMajor),
    [maxContributionMajor, minContributionMajor],
  );
  const parsedAmount = Number(amount.replace(/[^\d]/g, '')) || null;

  useImperativeHandle(ref, () => ({
    present: () => {
      setAmount('');
      sheetRef.current?.present();
    },
    dismiss: () => sheetRef.current?.dismiss(),
  }));

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.45} />
    ),
    [],
  );

  const openInsufficientWalletFlow = useCallback(
    (requiredLockMajor: number, message: string) => {
      sheetRef.current?.dismiss();
      onInsufficientWallet({ message, requiredLockMajor });
    },
    [onInsufficientWallet],
  );

  const submit = useCallback(() => {
    const major = Number(amount.replace(/[^\d.]/g, ''));
    if (!major || Number.isNaN(major)) {
      showAppToast('Enter a contribution amount', 'warning');
      return;
    }
    if (major < minContributionMajor) {
      showAppToast(
        `Minimum contribution is ${formatMoney(minContributionMajor, MARKET.currency)}.`,
        'warning',
      );
      return;
    }
    if (maxContributionMajor > 0 && major > maxContributionMajor) {
      showAppToast(
        `Maximum contribution is ${formatMoney(maxContributionMajor, MARKET.currency)}.`,
        'warning',
      );
      return;
    }

    if (wallet.isSuccess) {
      const availableMajor = wallet.data.available;
      if (walletLockShortfallMajor(major, availableMajor) > 0) {
        openInsufficientWalletFlow(major, INSUFFICIENT_WALLET_MESSAGE);
        return;
      }
    }

    contribute.mutate(
      { projectId, amountMajor: major },
      {
        onSuccess: () => {
          setAmount('');
          sheetRef.current?.dismiss();
          showAppToast('Contribution recorded', { type: 'success' });
        },
        onError: (error) => {
          if (isInsufficientWalletBalanceError(error)) {
            openInsufficientWalletFlow(major, toUserMessage(error));
            return;
          }
          showAppToast(toUserMessage(error), 'warning');
        },
      },
    );
  }, [
    amount,
    contribute,
    maxContributionMajor,
    minContributionMajor,
    openInsufficientWalletFlow,
    projectId,
    wallet.data,
    wallet.isSuccess,
  ]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      containerComponent={BottomSheetWindow}
      topInset={insets.top}
      bottomInset={insets.bottom}
      snapPoints={snapPoints}
      enablePanDownToClose
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.elevated }}
      handleIndicatorStyle={{ backgroundColor: colors.hairline, width: 48, height: 4 }}
    >
      <BottomSheetView style={{ flex: 1 }}>
        <KeyboardStickyFooter
          footer={
            <View className="border-t border-hairline bg-elevated px-5 pt-3">
              <Button
                label={contribute.isPending ? 'Contributing…' : 'Contribute'}
                variant="active"
                size="lg"
                loading={contribute.isPending}
                disabled={contribute.isPending}
                onPress={submit}
              />
            </View>
          }
        >
          <BottomSheetScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: 16,
              gap: 20,
            }}
          >
            <View className="gap-1">
              <Text className="text-2xl font-bold text-ink">Contribute</Text>
              <Text className="text-base text-muted" numberOfLines={2}>
                Add to the shared pool for {projectTitle.trim() || 'this project'}.
              </Text>
            </View>

            <View className="gap-2">
              <Text className="text-sm font-semibold text-ink">Amount</Text>
              <View className="rounded-2xl bg-surface px-5 py-4">
                <MoneyAmountInput
                  accessibilityLabel="Contribution amount"
                  value={amount}
                  onChangeText={(text) => setAmount(text.replace(/[^\d]/g, ''))}
                  InputComponent={BottomSheetTextInput}
                />
              </View>
              {amountPresets.length > 0 ? (
                <View className="flex-row flex-wrap gap-2">
                  {amountPresets.map((preset) => {
                    const selected = parsedAmount === preset;
                    return (
                      <Pressable
                        key={preset}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setAmount(String(preset))}
                        className={cn(
                          'rounded-xl px-4 py-2.5 active:opacity-90',
                          selected ? 'border border-active bg-surface' : 'bg-surface',
                        )}
                      >
                        <Text
                          className={cn(
                            'text-base font-semibold',
                            selected ? 'text-active' : 'text-muted',
                          )}
                        >
                          {formatMoney(preset, MARKET.currency)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              <Text className="text-sm text-muted">
                Min {formatMoney(minContributionMajor, MARKET.currency)}
                {maxContributionMajor > 0
                  ? ` · Max ${formatMoney(maxContributionMajor, MARKET.currency)}`
                  : null}
              </Text>
            </View>
          </BottomSheetScrollView>
        </KeyboardStickyFooter>
      </BottomSheetView>
    </BottomSheetModal>
  );
});