import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

export function RequestCompletionCard({
  completedAtLabel,
  ratingStars,
  ratingComment,
}: {
  completedAtLabel: string;
  ratingStars?: number | null;
  ratingComment?: string | null;
}) {
  const colors = useColors();

  return (
    <div className="shadow-card flex flex-col items-center gap-3 rounded-2xl border border-brand/30 bg-brand-soft p-6">
      <p className="text-lg font-bold text-brand">Request complete</p>
      <p className="text-sm text-muted">{completedAtLabel}</p>
      {ratingStars ? (
        <div className="flex w-full flex-col items-center gap-2">
          <div className="flex flex-row gap-1">
            {Array.from({ length: 5 }, (_, index) => (
              <IonIcon
                key={index}
                icon={index < ratingStars ? ionIcons.star : ionIcons['star-outline']}
                size={22}
                color={colors.warning}
              />
            ))}
          </div>
          {ratingComment ? (
            <p className="text-center text-sm leading-5 text-muted">{ratingComment}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
