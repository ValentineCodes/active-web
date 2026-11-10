export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-row items-center justify-between gap-3">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {actionLabel && onAction ? (
        <button type="button" className="text-sm font-semibold text-brand active:opacity-80" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
