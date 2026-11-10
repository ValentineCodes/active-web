import Link from 'next/link';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';

export function HomeActiveRequestBanner({ title, to }: { title: string; to: string }) {
  return (
    <Link
      href={to}
      aria-label={`Active now: ${title}`}
      className="shadow-raised mx-5 flex flex-row items-center gap-2.5 rounded-2xl bg-active px-4 py-3 active:opacity-90"
    >
      <IonIcon icon={ionIcons['radio-outline']} size={18} color="#ffffff" />
      <p className="min-w-0 flex-1 truncate text-xs font-semibold text-on-brand">Active now · {title}</p>
      <IonIcon icon={ionIcons['chevron-forward']} size={18} color="#ffffff" />
    </Link>
  );
}
