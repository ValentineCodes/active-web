import { useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type BaseProps = {
  label: string;
  hint?: string;
  error?: string | null;
  counterMax?: number;
};

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
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <input
        {...inputProps}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        className={cn(
          'rounded-2xl border-2 px-4 py-4 text-base text-ink outline-none',
          error
            ? 'border-danger bg-danger-soft'
            : focused
              ? 'border-brand bg-canvas'
              : 'border-transparent bg-surface',
          className,
        )}
      />
      {hint ? <span className="text-sm text-muted">{hint}</span> : null}
      {error ? <span className="text-sm text-danger">{error}</span> : null}
      {counterMax != null ? (
        <span className="text-xs text-subtle">
          {length} / {counterMax}
        </span>
      ) : null}
    </label>
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
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <textarea
        {...inputProps}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        className={cn(
          'min-h-24 resize-none rounded-2xl border-2 px-4 py-4 text-base text-ink outline-none',
          error
            ? 'border-danger bg-danger-soft'
            : focused
              ? 'border-brand bg-canvas'
              : 'border-transparent bg-surface',
          className,
        )}
      />
      {hint ? <span className="text-sm text-muted">{hint}</span> : null}
      {error ? <span className="text-sm text-danger">{error}</span> : null}
      {counterMax != null ? (
        <span className="text-xs text-subtle">
          {length} / {counterMax}
        </span>
      ) : null}
    </label>
  );
}
