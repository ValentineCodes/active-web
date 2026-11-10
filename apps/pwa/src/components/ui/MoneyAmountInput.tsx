'use client';

import type { ReactNode } from 'react';

import { MARKET } from '@/config/index';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme/ThemeProvider';

const ROW_HEIGHT = 48;

export function MoneyAmountInput({
  value,
  onChangeText,
  accessibilityLabel,
  maxLength = 9,
  trailing,
  className,
}: {
  value: string;
  onChangeText: (text: string) => void;
  accessibilityLabel: string;
  maxLength?: number;
  trailing?: ReactNode;
  className?: string;
}) {
  const colors = useColors();
  const showPlaceholder = value.length === 0;

  return (
    <div className={cn('relative w-full', className)} style={{ minHeight: ROW_HEIGHT }}>
      <div className="pointer-events-none absolute inset-0 flex flex-row items-center">
        <span className="pl-0 text-2xl font-bold text-ink">{MARKET.currencySymbol}</span>
        {showPlaceholder ? (
          <span className="pl-2 text-2xl font-bold text-subtle" aria-hidden>
            0
          </span>
        ) : (
          <span className="pl-2 text-2xl font-bold text-ink">{value}</span>
        )}
      </div>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={accessibilityLabel}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChangeText(event.target.value.replace(/\D/g, ''))}
        className="absolute inset-0 w-full bg-transparent text-2xl font-bold text-transparent caret-brand outline-none"
        style={{ caretColor: colors.brand }}
      />
      {trailing ? <div className="absolute right-0 top-1/2 -translate-y-1/2">{trailing}</div> : null}
    </div>
  );
}
