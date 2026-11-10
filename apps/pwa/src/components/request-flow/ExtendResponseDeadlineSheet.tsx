'use client';

import { format } from 'date-fns';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';

export function ExtendResponseDeadlineSheet({
  open,
  onClose,
  deadlineAt,
  onDeadlineAtChange,
  onExtend,
  extendLoading,
}: {
  open: boolean;
  onClose: () => void;
  deadlineAt: Date;
  onDeadlineAtChange: (date: Date) => void;
  onExtend: () => void;
  extendLoading: boolean;
}) {
  const value = format(deadlineAt, "yyyy-MM-dd'T'HH:mm");

  return (
    <BottomSheet
      open={open}
      title="New response deadline"
      onClose={onClose}
      footer={
        <div className="flex flex-row gap-3">
          <Button label="Cancel" variant="secondary" className="flex-1" disabled={extendLoading} onClick={onClose} />
          <Button label="Extend" className="flex-1" loading={extendLoading} onClick={onExtend} />
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-5 pb-2">
        <p className="text-sm text-muted">
          People nearby can respond again until this time. Your task date stays the same.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Deadline</span>
          <input
            type="datetime-local"
            className="rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink"
            value={value}
            disabled={extendLoading}
            onChange={(event) => {
              const next = new Date(event.target.value);
              if (!Number.isNaN(next.getTime())) onDeadlineAtChange(next);
            }}
          />
        </label>
      </div>
    </BottomSheet>
  );
}
