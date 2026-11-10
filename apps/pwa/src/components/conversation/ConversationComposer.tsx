'use client';

import { useState } from 'react';

import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/cn';

const MAX_LENGTH = 2000;

export function ConversationComposer({
  onSend,
  sending,
  disabled = false,
  disabledHint,
  onAttach,
}: {
  onSend: (body: string) => void | Promise<void>;
  sending: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onAttach: () => void;
}) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !sending && !disabled;

  const submit = async () => {
    if (!canSend) return;
    const snapshot = trimmed;
    setText('');
    await onSend(snapshot);
  };

  return (
    <div className="flex flex-row items-end gap-1 border-t border-hairline bg-canvas px-4 py-3">
      <textarea
        aria-label="Message"
        placeholder={disabled ? (disabledHint ?? 'Read-only') : 'Message'}
        maxLength={MAX_LENGTH}
        disabled={disabled || sending}
        value={text}
        rows={1}
        onChange={(event) => setText(event.target.value)}
        className={cn(
          'max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-hairline bg-elevated px-4 py-2.5 text-base text-ink outline-none placeholder:text-subtle',
          (disabled || sending) && 'opacity-60',
        )}
      />
      <div className={cn(!disabled ? '' : 'opacity-35')}>
        <IconButton icon="add" accessibilityLabel="Add photo or file" variant="surface" onClick={onAttach} />
      </div>
      <div className={cn(canSend ? '' : 'opacity-35')}>
        <IconButton icon="send" accessibilityLabel="Send message" variant="brand" onClick={() => void submit()} />
      </div>
    </div>
  );
}
