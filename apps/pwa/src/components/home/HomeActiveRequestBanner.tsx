import Link from '@/components/AppLink';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

export function HomeActiveRequestBanner({ title, to }: { title: string; to: string }) {
  const colors = useColors();

  return (
    <Link
      href={to}
      aria-label={`Active now: ${title}`}
      className="shadow-raised mx-5 flex flex-row items-center gap-2.5 rounded-2xl bg-active px-3.5 py-2 active:opacity-90"
    >
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-on-brand/15"
      >
        <span className="h-2 w-2 rounded-full bg-on-brand" />
      </span>
      <p className="min-w-0 flex-1 truncate text-xs font-semibold text-on-brand">Active now · {title}</p>
      <IonIcon icon={ionIcons['chevron-forward']} size={16} color={colors.onBrand} />
    </Link>
  );
}