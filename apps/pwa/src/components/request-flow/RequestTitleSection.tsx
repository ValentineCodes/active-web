import { ExpandableText } from '@/components/ui/ExpandableText';
import { requestOutcomeDescription } from '@/features/requests/outcome';

export function RequestTitleSection({
  title,
  description,
}: {
  title: string;
  description: string | null | undefined;
}) {
  const outcome = requestOutcomeDescription(description);

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold leading-8 text-ink">{title}</h1>
      {outcome ? (
        <ExpandableText
          text={outcome}
          modalTitle="Description"
          className="whitespace-pre-wrap text-base leading-6 text-muted"
        />
      ) : null}
    </div>
  );
}
