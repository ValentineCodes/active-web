'use client';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { formatMoney } from '@/lib/format';
import { InlineError } from '@/components/ui/StateView';

type Props = {
  open: boolean;
  busy: boolean;
  error: Error | null;
  milestoneTitle: string;
  milestonePosition: number;
  milestoneAmountMajor: number;
  currency: string;
  onClose: () => void;
  onApprove: () => void;
  onOpenChat?: () => void;
};

export function MilestoneApproveSheet({
  open,
  busy,
  error,
  milestoneTitle,
  milestonePosition,
  milestoneAmountMajor,
  currency,
  onClose,
  onApprove,
  onOpenChat,
}: Props) {
  const amountLabel = formatMoney(milestoneAmountMajor, currency);

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      elevated
      dismissible={!busy}
      footer={
        <div className="flex flex-row gap-3">
          <Button
            label="Not yet"
            variant="secondary"
            size="lg"
            corner="2xl"
            className="min-w-0 flex-1"
            disabled={busy}
            onClick={onClose}
          />
          <Button
            label="Approve and pay"
            variant="active"
            size="lg"
            corner="2xl"
            className="min-w-0 flex-1"
            loading={busy}
            onClick={onApprove}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-ink">Review milestone {milestonePosition}</h2>
          <p className="text-base font-semibold text-ink">{milestoneTitle}</p>
        </div>

        <p className="rounded-2xl border border-hairline bg-surface px-4 py-3 text-base font-bold text-ink">
          {amountLabel}
        </p>

        <p className="text-sm leading-5 text-muted">
          Check chat for what they submitted. If anything needs changing, message them there first.
          Approving releases this milestone payment from escrow.
        </p>

        {onOpenChat ? (
          <Button
            label="Open chat"
            variant="secondary"
            size="md"
            disabled={busy}
            onClick={onOpenChat}
          />
        ) : null}

        {error ? <InlineError error={error} /> : null}
      </div>
    </BottomSheet>
  );
}