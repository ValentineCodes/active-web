import { useId, type ClipboardEvent, type KeyboardEvent } from 'react';

import { cn } from '@/lib/cn';

const LENGTH = 6;

export function OtpInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const baseId = useId();
  const digits = value.padEnd(LENGTH, ' ').slice(0, LENGTH).split('');

  const commit = (raw: string) => {
    const cleaned = raw.replace(/\D/g, '').slice(0, LENGTH);
    onChange(cleaned);
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    commit(event.clipboardData.getData('text'));
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index]?.trim()) {
      const prev = document.getElementById(`${baseId}-${index - 1}`) as HTMLInputElement | null;
      prev?.focus();
    }
  };

  return (
    <div className="my-4 flex flex-row items-center justify-center" role="group" aria-label="6-digit verification code">
      {digits.map((digit, index) => {
        const active = digit.trim().length > 0 || document.activeElement?.id === `${baseId}-${index}`;
        return (
          <span key={`${baseId}-${index}`} className="relative mx-2 flex h-12 w-12 items-center justify-center">
            <input
              id={`${baseId}-${index}`}
              inputMode="numeric"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              value={digit.trim()}
              onChange={(event) => {
                const nextChar = event.target.value.replace(/\D/g, '').slice(-1);
                const next = value.split('');
                next[index] = nextChar;
                commit(next.join(''));
                if (nextChar) {
                  const nxt = document.getElementById(`${baseId}-${index + 1}`) as HTMLInputElement | null;
                  nxt?.focus();
                }
              }}
              onKeyDown={(event) => onKeyDown(index, event)}
              onPaste={onPaste}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={`Digit ${index + 1}`}
            />
            {digit.trim() ? (
              <span className="text-3xl font-medium text-ink">{digit.trim()}</span>
            ) : null}
            <span
              className={cn('absolute bottom-0 w-full', active ? 'h-0.5 bg-brand' : 'h-px bg-hairline')}
              aria-hidden
            />
          </span>
        );
      })}
    </div>
  );
}
