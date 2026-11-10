'use client';

import type { ReactNode, Ref } from 'react';

import { MARKET } from '@/config/index';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme/ThemeProvider';

const ROW_HEIGHT = 52;

/** Space between the currency symbol and amount digits (matches native). */
const AMOUNT_PAD_LEFT = 'pl-2';

export function MoneyAmountInput({
  value,
  onChangeText,
  accessibilityLabel,
  inputRef,
  maxLength = 9,
  trailing,
  className,
}: {
  value: string;
  onChangeText: (text: string) => void;
  accessibilityLabel: string;
  inputRef?: Ref<HTMLInputElement>;
  maxLength?: number;
  trailing?: ReactNode;
  className?: string;
}) {
  const colors = useColors();
  const showPlaceholder = value.length === 0;

  return (
    <div className={cn('flex w-full flex-row items-center', className)} style={{ minHeight: ROW_HEIGHT }}>
      <span className="shrink-0 text-3xl font-bold text-active">{MARKET.currencySymbol}</span>

      <div className="relative min-w-0 flex-1" style={{ height: ROW_HEIGHT }}>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={accessibilityLabel}
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChangeText(event.target.value.replace(/\D/g, ''))}
          className={cn(
            'absolute inset-0 w-full bg-transparent text-3xl font-bold text-ink outline-none',
            AMOUNT_PAD_LEFT,
            trailing ? 'pr-2' : undefined,
          )}
          style={{ caretColor: colors.brand }}
        />
        {showPlaceholder ? (
          <span
            className={cn(
              'pointer-events-none absolute inset-0 flex items-center text-3xl font-bold text-subtle',
              AMOUNT_PAD_LEFT,
            )}
            aria-hidden
          >
            0
          </span>
        ) : null}
      </div>

      {trailing ? <div className="shrink-0 pl-3">{trailing}</div> : null}
    </div>
  );
}
