'use client';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

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

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      elevated
      footer={
        <div className="flex flex-row gap-3">
          <Button
            label="Not now"
            variant="secondary"
            size="lg"
            corner="2xl"
            className="min-w-0 flex-1"
            onClick={onClose}
          />
          <Button
            label="Add money"
            variant="active"
            size="lg"
            corner="2xl"
            className="min-w-0 flex-1"
            onClick={onAddMoney}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft">
          <IonIcon icon={ionIcons['wallet-outline']} size={26} color={colors.warning} />
        </span>
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold leading-8 text-ink">Oops!... You&apos;re Broke</h2>
          <p className="text-base leading-6 text-muted">{message}</p>
        </div>
      </div>
    </BottomSheet>
  );
}