'use client';

import { useLayoutEffect, type RefObject } from 'react';

import { IconButton } from '@/components/ui/IconButton';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons, type IonIconName } from '@/components/ui/ion-icons';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme/ThemeProvider';

export function WizardProgress({ step, stepCount }: { step: number; stepCount: number }) {
  const progress = ((step + 1) / stepCount) * 100;
  return (
    <div className="mx-5 h-1 overflow-hidden rounded-full bg-surface">
      <div
        className="h-full rounded-full bg-active transition-[width] duration-200"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export function WizardHeader({
  title,
  step,
  stepCount,
  onClose,
  onBack,
}: {
  title: string;
  step: number;
  stepCount: number;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <header className="flex shrink-0 flex-row items-center gap-2 px-4 py-3">
      {onBack ? (
        <IconButton icon="chevron-back" variant="surface" accessibilityLabel="Go back" onClick={onBack} />
      ) : (
        <IconButton icon="close" variant="surface" accessibilityLabel="Close" onClick={onClose} />
      )}
      <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-ink">{title}</h1>
      <span className="min-w-10 text-right text-sm font-medium text-subtle">
        {step + 1} / {stepCount}
      </span>
    </header>
  );
}

export function StepTextArea({
  value,
  onChange,
  placeholder,
  maxLength,
  minHeight,
  textClassName,
  inputRef,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxLength: number;
  minHeight: number;
  textClassName: string;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  autoFocus?: boolean;
}) {
  return (
    <textarea
      ref={inputRef}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={4}
      className={cn(
        'w-full resize-none rounded-2xl bg-surface px-4 py-4 text-ink outline-none placeholder:text-subtle',
        textClassName,
      )}
      style={{ minHeight }}
    />
  );
}

export function StepFieldError({ message }: { message: string }) {
  return <p className="text-sm text-danger">{message}</p>;
}

export function WizardWhenPill({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-2xl px-4 py-4 text-center text-base font-semibold active:opacity-90',
        selected ? 'bg-active text-on-brand' : 'bg-surface text-ink',
      )}
    >
      {label}
    </button>
  );
}

export function PhotoSourceButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: IonIconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-3 rounded-2xl bg-surface px-4 py-6 active:opacity-90 disabled:opacity-50"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-active/15">
        <IonIcon icon={ionIcons[icon]} size={24} color={colors.active} />
      </span>
      <span className="text-base font-semibold text-ink">{label}</span>
    </button>
  );
}

export function useWizardStepFocus(
  step: number,
  focusStep: number,
  ref: RefObject<HTMLTextAreaElement | HTMLInputElement | null>,
  startDelayMs = 450,
) {
  useLayoutEffect(() => {
    if (step !== focusStep) return;

    let cancelled = false;
    let timeoutId = 0;
    let rafId = 0;
    let attempts = 0;

    const focusTarget = () => {
      if (cancelled) return;
      const el = ref.current;
      if (el) {
        try {
          el.focus({ preventScroll: true });
        } catch {
          el.focus();
        }
        return;
      }
      attempts += 1;
      if (attempts < 24) {
        rafId = requestAnimationFrame(focusTarget);
      }
    };

    timeoutId = window.setTimeout(() => {
      focusTarget();
    }, startDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      cancelAnimationFrame(rafId);
    };
  }, [focusStep, ref, startDelayMs, step]);
}

export function WizardPhotoPreview({
  uri,
  alt,
  onRemove,
  removeDisabled,
}: {
  uri: string;
  alt: string;
  onRemove?: () => void;
  removeDisabled?: boolean;
}) {
  const colors = useColors();
  if (!isLocalAttachmentUri(uri)) return null;
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface">
      <img src={uri} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
      {onRemove ? (
        <button
          type="button"
          aria-label="Remove photo"
          disabled={removeDisabled}
          onClick={onRemove}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-canvas/95 shadow-sm active:opacity-90 disabled:opacity-50"
        >
          <IonIcon icon={ionIcons['close-circle-outline']} size={28} color={colors.ink} />
        </button>
      ) : null}
    </div>
  );
}

export function isLocalAttachmentUri(uri: string) {
  return uri.startsWith('blob:') || uri.startsWith('data:');
}