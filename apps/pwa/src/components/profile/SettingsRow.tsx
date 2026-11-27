import Link from '@/components/AppLink';
import type { ReactNode } from 'react';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons, type IonIconName } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

export function SettingsRow({
  label,
  description,
  detail,
  to,
  onClick,
  showDivider,
  icon,
  trailing,
}: {
  label: string;
  description?: string;
  /** Short value shown beside the chevron (e.g. wallet balance). */
  detail?: string;
  to?: string;
  onClick?: () => void;
  showDivider?: boolean;
  icon?: IonIconName;
  trailing?: ReactNode;
}) {
  const colors = useColors();
  const navigable = Boolean(to || onClick);
  const showChevron = navigable && trailing == null;

  const inner = (
    <>
      {showDivider ? <div className="mx-4 h-px bg-hairline" /> : null}
      <span className="flex flex-row items-center gap-3 px-4 py-3.5">
        {icon ? (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface"
            aria-hidden
          >
            <IonIcon icon={ionIcons[icon]} size={20} color={colors.active} />
          </span>
        ) : null}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-base font-medium text-ink">{label}</span>
          {description ? <span className="text-sm text-muted">{description}</span> : null}
        </span>
        {trailing ??
          (showChevron || detail ? (
            <span className="flex shrink-0 flex-row items-center gap-1">
              {detail ? <span className="text-base text-muted">{detail}</span> : null}
              {showChevron ? (
                <IonIcon icon={ionIcons['chevron-forward']} size={18} color={colors.subtle} />
              ) : null}
            </span>
          ) : null)}
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

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-left active:opacity-90">
        {inner}
      </button>
    );
  }

  return <div className="block w-full text-left">{inner}</div>;
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