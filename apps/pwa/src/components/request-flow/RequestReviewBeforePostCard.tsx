import { RequestTagsLine } from '@/components/request-flow/RequestTagsLine';

export function RequestReviewBeforePostCard({
  title,
  description,
  amountLabel,
  whenLabel,
  locationLabel,
  tagSlugs,
  previewUri,
  reviewHeading = 'Review before posting',
}: {
  title: string;
  description: string;
  amountLabel: string | null;
  whenLabel: string;
  locationLabel: string;
  tagSlugs: string[];
  previewUri?: string | null;
  reviewHeading?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-hairline bg-elevated p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{reviewHeading}</p>
      {previewUri ? (
        <img
          src={previewUri}
          alt="Selected request photo"
          className="aspect-4/3 w-full rounded-xl bg-surface object-cover"
        />
      ) : null}
      <p className="truncate text-xl font-bold text-ink">{title}</p>
      {description ? (
        <p className="line-clamp-2 text-sm leading-5 text-muted">{description}</p>
      ) : null}
      <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-1 pt-1">
        {amountLabel ? <span className="text-base font-bold text-active">{amountLabel}</span> : null}
        <span className="text-sm text-muted">·</span>
        <span className="text-sm text-muted">{whenLabel}</span>
        <span className="text-sm text-muted">·</span>
        <span className="text-sm text-muted">{locationLabel}</span>
      </div>
      <RequestTagsLine slugs={tagSlugs} />
    </div>
  );
}
