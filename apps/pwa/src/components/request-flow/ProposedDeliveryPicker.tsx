'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_DELIVERY_DURATION,
  DELIVERY_DURATION_UNITS,
  formatInDurationPreview,
  maxValueForDeliveryUnit,
  type DeliveryDurationUnit,
  validateProposedDeliveryDuration,
} from '@/features/requests/delivery-duration';

export function defaultProposedDeliveryDuration() {
  return { ...DEFAULT_DELIVERY_DURATION };
}

export function ProposedDeliveryPicker({
  value,
  unit,
  onChange,
  error,
}: {
  value: number;
  unit: DeliveryDurationUnit;
  onChange: (next: { value: number; unit: DeliveryDurationUnit }) => void;
  error?: string | null;
}) {
  const validationMessage = useMemo(
    () => error ?? validateProposedDeliveryDuration(value, unit),
    [error, value, unit],
  );
  const preview = formatInDurationPreview(value, unit);
  const maxValue = maxValueForDeliveryUnit(unit);
  const [amountDraft, setAmountDraft] = useState(() => String(value));

  useEffect(() => {
    setAmountDraft(String(value));
  }, [value, unit]);

  const commitAmount = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 0) {
      setAmountDraft('');
      return;
    }
    const parsed = Number.parseInt(digits, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.min(maxValue, Math.max(1, parsed));
    setAmountDraft(String(clamped));
    onChange({ value: clamped, unit });
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <p className="text-base font-semibold text-ink">How long until delivery?</p>
      <p className="text-sm leading-5 text-muted">
        Choose how much time you need after you press Start. The countdown does not begin until then.
      </p>
      <p className="text-base font-semibold text-ink">{preview}</p>
      {validationMessage ? <p className="text-sm text-warning">{validationMessage}</p> : null}
      <div className="flex flex-row items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Amount</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className="rounded-xl border border-hairline bg-canvas px-3 py-3 text-base text-ink tabular-nums"
            value={amountDraft}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, '');
              setAmountDraft(digits);
              if (digits.length === 0) return;
              const parsed = Number.parseInt(digits, 10);
              if (Number.isNaN(parsed)) return;
              onChange({
                value: Math.min(maxValue, Math.max(1, parsed)),
                unit,
              });
            }}
            onBlur={() => {
              if (amountDraft.length === 0) {
                setAmountDraft(String(value));
                return;
              }
              commitAmount(amountDraft);
            }}
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Unit</span>
          <select
            className="rounded-xl border border-hairline bg-canvas px-3 py-3 text-base text-ink"
            value={unit}
            onChange={(event) => {
              const nextUnit = event.target.value as DeliveryDurationUnit;
              const nextMax = maxValueForDeliveryUnit(nextUnit);
              onChange({ value: Math.min(value, nextMax), unit: nextUnit });
            }}
          >
            {DELIVERY_DURATION_UNITS.map((item) => (
              <option key={item} value={item}>
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-subtle">Maximum is 30 days. The server validates your choice.</p>
    </div>
  );
}