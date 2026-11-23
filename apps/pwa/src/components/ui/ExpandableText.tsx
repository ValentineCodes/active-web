'use client';

import { useState } from 'react';

import { LongTextModal } from '@/components/ui/LongTextModal';
import { cn } from '@/lib/cn';

/** Long enough for ~3 lines of body copy before offering the full-text modal. */
export const LONG_TEXT_PREVIEW_CHARS = 280;

function truncateLongTextPreview(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > maxChars * 0.55 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

type Props = {
  text: string;
  modalTitle: string;
  className?: string;
  previewChars?: number;
};

export function ExpandableText({
  text,
  modalTitle,
  className,
  previewChars = LONG_TEXT_PREVIEW_CHARS,
}: Props) {
  const [open, setOpen] = useState(false);
  const trimmed = text.trim();
  if (!trimmed) return null;

  const needsExpand = trimmed.length > previewChars;
  const visible = needsExpand ? truncateLongTextPreview(trimmed, previewChars) : trimmed;

  return (
    <div className="flex flex-col gap-1">
      <p className={cn(className)}>{visible}</p>
      {needsExpand ? (
        <button
          type="button"
          className="self-start text-sm font-semibold text-active active:opacity-90"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          Show more
        </button>
      ) : null}
      <LongTextModal
        open={open}
        title={modalTitle}
        body={trimmed}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}