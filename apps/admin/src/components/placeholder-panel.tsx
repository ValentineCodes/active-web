import { Construction } from 'lucide-react';

type Props = {
  title: string;
  description: string;
};

export function PlaceholderPanel({ title, description }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-elevated p-10 shadow-card">
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-brand-light text-brand-dark">
          <Construction className="size-6" aria-hidden />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <p className="text-sm leading-relaxed text-muted">{description}</p>
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">
          Coming in a later release
        </p>
      </div>
    </div>
  );
}
