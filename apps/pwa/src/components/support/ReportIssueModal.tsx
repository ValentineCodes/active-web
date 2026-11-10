'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/TextField';
import {
  SOMETHING_ELSE_ISSUE_ID,
  type ReportIssueOption,
} from '@/features/support/report-issue-options';
import { cn } from '@/lib/cn';

type Props = {
  open: boolean;
  issues: ReportIssueOption[];
  onClose: () => void;
  onSubmit: () => void;
};

export function ReportIssueModal({ open, issues, onClose, onSubmit }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setComment('');
    }
  }, [open]);

  if (!open) return null;

  const requiresComment = selectedId === SOMETHING_ELSE_ISSUE_ID;
  const canSend = selectedId !== null && (!requiresComment || comment.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        className="flex max-h-[85dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl bg-canvas p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-issue-title"
      >
        <h2 id="report-issue-title" className="text-xl font-bold text-ink">
          Report a problem
        </h2>
        <p className="text-sm text-muted">What&apos;s going on?</p>
        <div className="flex flex-col gap-2">
          {issues.map((issue) => (
            <button
              key={issue.id}
              type="button"
              onClick={() => setSelectedId(issue.id)}
              className={cn(
                'rounded-xl border px-4 py-3 text-left text-base text-ink active:opacity-90',
                selectedId === issue.id ? 'border-active bg-active-soft' : 'border-hairline bg-elevated',
              )}
            >
              {issue.label}
            </button>
          ))}
        </div>
        {selectedId ? (
          <TextAreaField
            label={requiresComment ? 'Tell us more' : 'Details (optional)'}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Add context if helpful"
          />
        ) : null}
        <div className="flex flex-row gap-2">
          <Button label="Cancel" variant="ghost" className="flex-1" onClick={onClose} />
          <Button
            label="Send report"
            className="flex-1"
            disabled={!canSend}
            onClick={() => {
              onSubmit();
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
