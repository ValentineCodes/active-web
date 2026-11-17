'use client';

import type { ReactNode } from 'react';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { chooseResponderDialog } from '@/features/requests/selection-copy';
import { useColors } from '@/theme/ThemeProvider';

export function ChooseResponderSheet({
  open,
  onClose,
  displayName,
  onConfirm,
  confirmLoading,
  milestonePayments,
  planPreview,
}: {
  open: boolean;
  onClose: () => void;
  displayName: string | null;
  onConfirm: () => void;
  confirmLoading?: boolean;
  milestonePayments?: boolean;
  planPreview?: ReactNode;
}) {
  const colors = useColors();
  const dialog = chooseResponderDialog(displayName, milestonePayments);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      elevated
      dismissible={!confirmLoading}
      footer={
        <div className="flex flex-row gap-3">
          <Button
            label={dialog.cancel}
            variant="secondary"
            size="lg"
            corner="2xl"
            className="min-w-0 flex-1"
            disabled={confirmLoading}
            onClick={onClose}
          />
          <Button
            label={dialog.confirm}
            variant="active"
            size="lg"
            corner="2xl"
            className="min-w-0 flex-1"
            loading={confirmLoading}
            onClick={onConfirm}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-active-soft">
          <IonIcon icon={ionIcons['checkmark-circle-outline']} size={26} color={colors.active} />
        </span>
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold leading-8 text-ink">{dialog.title}</h2>
          <p className="text-base leading-6 text-muted">{dialog.message}</p>
        </div>
        {planPreview}
      </div>
    </BottomSheet>
  );
}