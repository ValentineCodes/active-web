'use client';

import { WizardPhotoPreview } from '@/components/create-flow/wizard-chrome';
import { TagPill } from '@/components/request-flow/TagPill';
import { formatMoney } from '@/lib/format';
import { MARKET } from '@/config';

export function ProjectReviewBeforePostCard({
  title,
  description,
  budgetMajor,
  minTargetMajor,
  minContributionMajor,
  deadlineLabel,
  visibilityLabel,
  locationLabel,
  tagNames,
  previewUri,
  onRemovePhoto,
  removePhotoDisabled,
}: {
  title: string;
  description: string;
  budgetMajor: number;
  minTargetMajor: number;
  minContributionMajor: number;
  deadlineLabel: string;
  visibilityLabel: string;
  locationLabel: string;
  tagNames: string[];
  previewUri?: string | null;
  onRemovePhoto?: () => void;
  removePhotoDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-hairline bg-elevated p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Review before creating</p>
      {previewUri ? (
        <WizardPhotoPreview
          uri={previewUri}
          alt="Selected project photo"
          onRemove={onRemovePhoto}
          removeDisabled={removePhotoDisabled}
        />
      ) : null}
      <p className="truncate text-xl font-bold text-ink">{title}</p>
      {description ? (
        <p className="line-clamp-3 text-sm leading-5 text-muted">{description}</p>
      ) : null}
      <div className="flex flex-col gap-1 text-sm text-muted">
        <span>
          Budget <span className="font-semibold text-ink">{formatMoney(budgetMajor, MARKET.currency)}</span>
        </span>
        <span>
          Min. target {formatMoney(minTargetMajor, MARKET.currency)} · Min. contribution{' '}
          {formatMoney(minContributionMajor, MARKET.currency)}
        </span>
        <span>
          {deadlineLabel} · {visibilityLabel} · {locationLabel}
        </span>
      </div>
      {tagNames.length > 0 ? (
        <div className="flex flex-row flex-wrap gap-2">
          {tagNames.map((name) => (
            <TagPill key={name} label={name} selected />
          ))}
        </div>
      ) : null}
    </div>
  );
}