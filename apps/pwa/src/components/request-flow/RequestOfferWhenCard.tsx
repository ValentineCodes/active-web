import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

type Props = {
  amount: string;
  whenLabel: string;
  whenDetail?: string;
  locationLabel?: string;
};

export function RequestOfferWhenCard({ amount, whenLabel, whenDetail, locationLabel }: Props) {
  const colors = useColors();
  const showDetailRow = whenDetail !== undefined || locationLabel !== undefined;

  return (
    <div className="shadow-card w-full shrink-0 overflow-hidden rounded-2xl border border-hairline bg-elevated p-4">
      {showDetailRow ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Offer</p>
            <p className="text-3xl font-bold text-active">{amount}</p>
          </div>
          <div className="h-px bg-hairline" />
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-row items-center gap-1.5">
                <IonIcon icon={ionIcons['time-outline']} size={14} color={colors.subtle} />
                <p className="text-xs font-semibold uppercase tracking-wide text-subtle">When</p>
              </div>
              <p className="text-base font-semibold text-ink">{whenDetail ?? whenLabel}</p>
            </div>
            {locationLabel ? (
              <>
                <div className="w-px self-stretch bg-hairline" />
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-row items-center gap-1.5">
                    <IonIcon icon={ionIcons['navigate-outline']} size={14} color={colors.subtle} />
                    <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Location</p>
                  </div>
                  <p className="text-base font-semibold text-ink">{locationLabel}</p>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Offer</p>
            <p className="text-3xl font-bold text-active">{amount}</p>
          </div>
          <div className="w-px self-stretch bg-hairline" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">When</p>
            <p className="text-base font-semibold text-ink">{whenLabel}</p>
          </div>
        </div>
      )}
    </div>
  );
}
