'use client';

import { useState } from 'react';

import { useColors } from '@/theme/ThemeProvider';

type Props = {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
};

/** Matches native sign-in phone row (`phone.tsx` underline field). */
export function PhoneUnderlineField({ value, onChange, autoFocus }: Props) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);

  return (
    <div
      className="mt-8 pb-2"
      style={{
        borderBottomWidth: focused ? 2 : 1,
        borderBottomStyle: 'solid',
        borderBottomColor: focused ? colors.brand : colors.hairline,
      }}
    >
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="e.g. 08012345678"
        className="m-0 w-full border-0 bg-transparent py-2 text-xl font-normal text-ink outline-none placeholder:text-muted"
        aria-label="Your phone number"
      />
    </div>
  );
}
