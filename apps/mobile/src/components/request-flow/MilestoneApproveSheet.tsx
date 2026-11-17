import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetWindow } from '@/components/ui/BottomSheetWindow';
import { Button } from '@/components/ui/Button';
import { InlineError } from '@/components/ui/StateView';
import { formatMoney } from '@/lib/format';
import { useColors } from '@/theme';

export type MilestoneApproveSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  milestoneTitle: string;
  milestonePosition: number;
  milestoneAmountMajor: number;
  currency: string;
  busy: boolean;
  error: Error | null;
  onApprove: () => void;
  onClose: () => void;
  onOpenChat?: () => void;
};

export const MilestoneApproveSheet = forwardRef<MilestoneApproveSheetHandle, Props>(
  function MilestoneApproveSheet(
    {
      milestoneTitle,
      milestonePosition,
      milestoneAmountMajor,
      currency,
      busy,
      error,
      onApprove,
      onClose,
      onOpenChat,
    },
    ref,
  ) {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['55%'], []);

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const dismiss = useCallback(() => {
      if (busy) return;
      sheetRef.current?.dismiss();
    }, [busy]);

    const handleDismiss = useCallback(() => {
      if (busy) return;
      onClose();
    }, [busy, onClose]);

    const amountLabel = formatMoney(milestoneAmountMajor, currency);

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose={!busy}
        onDismiss={handleDismiss}
        backdropComponent={(props) => <BottomSheetWindow.Backdrop {...props} />}
        handleIndicatorStyle={{ backgroundColor: colors.hairline }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 16, gap: 16 }}
        >
          <View className="gap-1">
            <Text className="text-xl font-bold text-ink">Review milestone {milestonePosition}</Text>
            <Text className="text-base font-semibold text-ink">{milestoneTitle}</Text>
          </View>

          <Text className="rounded-2xl border border-hairline bg-surface px-4 py-3 text-base font-bold text-ink">
            {amountLabel}
          </Text>

          <Text className="text-sm leading-5 text-muted">
            Check chat for what they submitted. If anything needs changing, message them there first.
            Approving releases this milestone payment from escrow.
          </Text>

          {onOpenChat ? (
            <Button label="Open chat" variant="secondary" size="md" disabled={busy} onPress={onOpenChat} />
          ) : null}

          {error ? <InlineError error={error} /> : null}

          <View className="flex-row gap-3">
            <Button
              label="Not yet"
              variant="secondary"
              size="lg"
              className="flex-1"
              disabled={busy}
              onPress={dismiss}
            />
            <Button
              label="Approve and pay"
              variant="active"
              size="lg"
              className="flex-1"
              loading={busy}
              onPress={onApprove}
            />
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);