'use client';

import { useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';
type BaseProps = {
  label: string;
  hint?: string;
  error?: string | null;
  counterMax?: number;
};

function FieldMeta({
  error,
  hint,
  counterMax,
  length,
}: {
  error?: string | null;
  hint?: string;
  counterMax?: number;
  length: number;
}) {
  return (
    <div className="flex flex-row justify-between gap-4">
      <p className={cn('flex-1 text-sm', error ? 'text-danger' : 'text-muted')} role={error ? 'alert' : undefined}>
        {error ?? hint ?? ''}
      </p>
      {counterMax != null ? (
        <p className="text-sm text-muted">
          {length} / {counterMax}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  counterMax,
  className = '',
  onFocus,
  onBlur,
  ...inputProps
}: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);
  const length = typeof inputProps.value === 'string' ? inputProps.value.length : 0;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-ink">{label}</label>
      <input
        {...inputProps}
        aria-label={label}
        placeholder={inputProps.placeholder}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        className={cn(
          'rounded-2xl border-2 px-4 py-4 text-sm text-ink outline-none placeholder:text-subtle',
          error
            ? 'border-danger bg-danger-soft'
            : focused
              ? 'border-brand bg-canvas'
              : 'border-transparent bg-surface',
          className,
        )}
      />
      <FieldMeta error={error} hint={hint} counterMax={counterMax} length={length} />
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  counterMax,
  className = '',
  onFocus,
  onBlur,
  ...inputProps
}: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false);
  const length = typeof inputProps.value === 'string' ? inputProps.value.length : 0;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-ink">{label}</label>
      <textarea
        {...inputProps}
        aria-label={label}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        className={cn(
          'min-h-24 resize-none rounded-2xl border-2 px-4 py-4 text-sm text-ink outline-none',
          error
            ? 'border-danger bg-danger-soft'
            : focused
              ? 'border-brand bg-canvas'
              : 'border-transparent bg-surface',
          className,
        )}
      />
      <FieldMeta error={error} hint={hint} counterMax={counterMax} length={length} />
    </div>
  );
}
