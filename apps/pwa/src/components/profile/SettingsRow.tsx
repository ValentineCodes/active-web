import Link from 'next/link';
import type { ReactNode } from 'react';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';

export function SettingsRow({
  label,
  to,
  onClick,
  showDivider,
}: {
  label: string;
  to?: string;
  onClick?: () => void;
  showDivider?: boolean;
}) {
  const inner = (
    <>
      {showDivider ? <div className="mx-4 h-px bg-hairline" /> : null}
      <span className="flex flex-row items-center justify-between px-4 py-4">
        <span className="text-base text-ink">{label}</span>
        <IonIcon icon={ionIcons['chevron-forward']} size={20} color="#8A948C" />
      </span>
    </>
  );

  if (to) {
    return (
      <Link href={to} className="block active:opacity-90">
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className="block w-full text-left active:opacity-90">
      {inner}
    </button>
  );
}

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-subtle">{title}</p>
      <div className="overflow-hidden rounded-2xl border border-hairline bg-elevated">{children}</div>
    </div>
  );
}

export function ProfileStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-4">
      <p className="text-2xl font-bold leading-8 text-ink">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}
