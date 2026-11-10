'use client';

import { REGEXP_ONLY_DIGITS } from 'input-otp';

import { InputOTP } from '@/components/ui/input-otp';
import { cn } from '@/lib/cn';

const LENGTH = 6;

type OtpSlotProps = {
  char: string | null;
  isActive: boolean;
  hasFakeCaret: boolean;
};

export function OtpInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <InputOTP
      maxLength={LENGTH}
      value={value}
      onChange={onChange}
      autoFocus={autoFocus}
      inputMode="numeric"
      pattern={REGEXP_ONLY_DIGITS}
      autoComplete="one-time-code"
      textAlign="center"
      containerClassName="relative my-4 flex min-h-12 w-full justify-center"
      render={({ slots }) => (
        <div className="flex flex-row items-center justify-center" role="presentation">
          {slots.map((slot, index) => (
            <OtpDashedSlot key={index} {...slot} />
          ))}
        </div>
      )}
    />
  );
}

/** Dashed underline slots — parity with native `OtpDashedInput`. */
function OtpDashedSlot({ char, isActive, hasFakeCaret }: OtpSlotProps) {
  const underlineActive = isActive || char !== null;

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className="relative mx-1.5 flex h-12 w-11 shrink-0 items-center justify-center sm:mx-2 sm:w-12"
    >
      {char !== null ? <span className="text-3xl font-medium text-ink">{char}</span> : null}
      {hasFakeCaret ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="h-7 w-0.5 animate-pulse rounded-sm bg-brand" aria-hidden />
        </div>
      ) : null}
      <span
        className={cn(
          'absolute bottom-0 left-0 right-0',
          underlineActive ? 'border-b-2 border-brand' : 'border-b border-hairline',
        )}
        aria-hidden
      />
    </div>
  );
}
