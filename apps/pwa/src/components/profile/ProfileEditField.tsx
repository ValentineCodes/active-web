'use client';

import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type ProfileEditFieldProps = {
  label: string;
  multiline?: false;
} & InputHTMLAttributes<HTMLInputElement>;

type ProfileEditTextAreaProps = {
  label: string;
  multiline: true;
} & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function ProfileEditField(props: ProfileEditFieldProps | ProfileEditTextAreaProps) {
  const { label, multiline, className, ...rest } = props;
  const fieldClassName = cn(
    'rounded-2xl bg-surface px-4 py-4 text-base text-ink outline-none placeholder:text-subtle',
    className,
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-subtle">{label}</p>
      {multiline ? (
        <textarea
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          aria-label={label}
          className={cn(fieldClassName, 'min-h-32 resize-none')}
        />
      ) : (
        <input
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
          aria-label={label}
          className={fieldClassName}
        />
      )}
    </div>
  );
}