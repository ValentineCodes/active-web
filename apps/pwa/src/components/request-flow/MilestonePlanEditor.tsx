'use client';

import { useMemo } from 'react';

import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { MARKET } from '@/config/index';
import {
  createEmptyMilestoneDraft,
  MILESTONE_MAX,
  MILESTONE_MIN,
  milestoneDraftTotals,
  milestoneFillRatio,
  type MilestoneDraftItem,
} from '@/features/requests/milestones';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { useColors } from '@/theme/ThemeProvider';

type MilestonePlanEditorProps = {
  items: MilestoneDraftItem[];
  onChange: (next: MilestoneDraftItem[]) => void;
  totalMajor: number | null;
  validationMessage?: string | null;
  showIntro?: boolean;
};

export function MilestonePlanEditor({
  items,
  onChange,
  totalMajor,
  validationMessage,
  showIntro = true,
}: MilestonePlanEditorProps) {
  const colors = useColors();
  const totals = useMemo(() => milestoneDraftTotals(items, totalMajor), [items, totalMajor]);
  const fillRatio = milestoneFillRatio(totals.allocated, totalMajor);
  const matches = totals.remaining === 0;

  const updateItem = (id: string, patch: Partial<MilestoneDraftItem>) => {
    onChange(items.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeItem = (id: string) => {
    if (items.length <= MILESTONE_MIN) return;
    onChange(items.filter((row) => row.id !== id));
  };

  const addItem = () => {
    if (items.length >= MILESTONE_MAX) return;
    onChange([...items, createEmptyMilestoneDraft()]);
  };

  return (
    <div
      className="mt-3 w-full min-w-0 max-w-full rounded-[14px] border border-hairline bg-elevated p-3.5"
      role="group"
      aria-label="Edit milestone schedule"
    >
      {showIntro ? (
        <div className="mb-3.5 flex flex-row items-start gap-2.5 rounded-[10px] bg-surface px-3 py-2.5">
          <IonIcon icon={ionIcons['information-circle-outline']} size={16} color={colors.active} />
          <p className="m-0 flex-1 text-xs leading-[1.45] text-muted">
            Split the task into {MILESTONE_MIN}–{MILESTONE_MAX} steps. Each amount is in{' '}
            <strong className="text-ink">{MARKET.currency}</strong> and must sum exactly to the offer
            total.
          </p>
        </div>
      ) : null}

      {validationMessage ? (
        <p className="mb-3 text-xs text-danger" role="alert">
          {validationMessage}
        </p>
      ) : null}

      <ul className="m-0 flex list-none flex-col p-0">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li
              key={item.id}
              className={cn(
                'grid w-full min-w-0 max-w-full grid-cols-[28px_minmax(0,1fr)] gap-2.5',
                isLast ? 'pb-1.5' : 'pb-3.5',
              )}
            >
              <span className="flex min-h-full shrink-0 flex-col items-center" aria-hidden>
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-ink bg-surface text-[11px] font-extrabold text-ink">
                  {index + 1}
                </span>
                {!isLast ? <span className="mt-1.5 min-h-4 w-0.5 flex-1 bg-hairline" /> : null}
              </span>
              <div className="min-w-0 w-full max-w-full overflow-hidden rounded-xl border border-hairline bg-surface p-3">
                <div className="mb-2.5 flex min-w-0 flex-row items-center justify-between gap-2">
                  <span className="min-w-0 shrink text-[10px] font-extrabold uppercase tracking-widest text-muted">
                    Milestone {index + 1}
                  </span>
                  {items.length > MILESTONE_MIN ? (
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-muted active:bg-elevated"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Remove milestone ${index + 1}`}
                    >
                      <IonIcon icon={ionIcons.close} size={14} color={colors.muted} />
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="flex min-w-0 w-full max-w-full flex-col gap-2.5">
                  <div className="flex min-w-0 w-full flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted" htmlFor={`ms_title_${item.id}`}>
                      Title
                    </label>
                    <input
                      id={`ms_title_${item.id}`}
                      className="box-border w-full max-w-full rounded-xl bg-elevated px-4 py-3 text-base font-semibold text-ink outline-none placeholder:text-subtle"
                      value={item.title}
                      onChange={(e) => updateItem(item.id, { title: e.target.value })}
                      maxLength={120}
                      placeholder="Milestone name"
                    />
                  </div>
                  <div className="flex min-w-0 w-full flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted" htmlFor={`ms_desc_${item.id}`}>
                      Notes <em className="font-normal text-subtle">(optional)</em>
                    </label>
                    <textarea
                      id={`ms_desc_${item.id}`}
                      className="box-border min-h-20 w-full max-w-full resize-none rounded-xl bg-elevated px-4 py-3 text-base text-ink outline-none placeholder:text-subtle"
                      value={item.description}
                      onChange={(e) => updateItem(item.id, { description: e.target.value })}
                      maxLength={1000}
                      rows={2}
                      placeholder="What you expect at this step"
                    />
                  </div>
                  <div className="flex min-w-0 w-full flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted">Amount</label>
                    <div className="box-border w-full max-w-full overflow-hidden rounded-xl bg-elevated px-4 py-3">
                      <MoneyAmountInput
                        className="w-full min-w-0"
                        accessibilityLabel={`Milestone ${index + 1} amount`}
                        value={item.amount}
                        onChangeText={(text) => updateItem(item.id, { amount: text.replace(/[^\d]/g, '') })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {items.length < MILESTONE_MAX ? (
        <button
          type="button"
          disabled={items.length >= MILESTONE_MAX}
          onClick={addItem}
          className="mt-2 flex w-full flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline py-3.5 text-base font-semibold text-active active:opacity-90 disabled:opacity-50"
        >
          <IonIcon icon={ionIcons['add-circle-outline']} size={18} color={colors.active} />
          Add milestone
          <span className="text-sm font-medium text-muted">
            ({MILESTONE_MAX - items.length} remaining)
          </span>
        </button>
      ) : null}

      {totalMajor != null ? (
        <div
          className={cn(
            'mt-3 flex flex-col gap-2 rounded-xl border p-3',
            matches ? 'border-active/30 bg-active/5' : 'border-warning/30 bg-warning/5',
          )}
          role="status"
        >
          <div className="flex flex-row flex-wrap justify-between gap-2 text-sm text-muted">
            <span>
              Milestone total:{' '}
              <strong className="text-ink">{formatMoney(totals.allocated, MARKET.currency)}</strong>
            </span>
            <span>
              Budget:{' '}
              <strong className="text-ink">{formatMoney(totalMajor, MARKET.currency)}</strong>
            </span>
          </div>
          {fillRatio != null ? (
            <span className="relative block h-1.5 overflow-hidden rounded-full bg-hairline/80">
              <span
                className={cn(
                  'block h-full rounded-full transition-[width] duration-200',
                  matches ? 'bg-active' : 'bg-warning',
                )}
                style={{ width: `${fillRatio}%` }}
              />
            </span>
          ) : null}
          <p className="flex flex-row items-center gap-1.5 text-xs text-muted">
            {matches ? (
              <>
                <IonIcon icon={ionIcons['checkmark-circle']} size={14} color={colors.active} />
                Amounts match the task budget
              </>
            ) : totals.remaining !== null && totals.remaining > 0 ? (
              <>
                {formatMoney(totals.remaining, MARKET.currency)} left to allocate across milestones
              </>
            ) : (
              <>Reduce milestone amounts to match the budget</>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}