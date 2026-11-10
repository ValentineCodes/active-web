import Link from 'next/link';

import { Avatar } from '@/components/ui/Avatar';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { hasProviderCommitments, type MyAttendance } from '@/features/attendance/api';
import { formatGreetingFirstName, formatGreetingPeriod, formatMoney } from '@/lib/format';

type Props = {
  loading: boolean;
  displayName: string | null;
  avatarPath: string | null;
  attendance: MyAttendance | undefined;
  walletAvailable: number | null;
  walletCurrency: string | null;
};

export function HomeFeedHeader({
  loading,
  displayName,
  avatarPath,
  attendance,
  walletAvailable,
  walletCurrency,
}: Props) {
  const firstName = formatGreetingFirstName(displayName);

  if (loading) {
    return (
      <div className="flex flex-row items-center justify-between gap-3 px-5 pb-2 pt-1">
        <div className="flex min-w-0 flex-1 flex-row items-center gap-3">
          <SkeletonBlock className="h-12 w-12 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <SkeletonBlock className="h-4 w-28 rounded-md" />
            <SkeletonBlock className="h-6 w-36 rounded-md" />
          </div>
        </div>
        <SkeletonBlock className="h-7 w-20 rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-row items-center justify-between gap-3 px-5 pb-2 pt-1">
      <div className="flex min-w-0 flex-1 flex-row items-center gap-3">
        <Link href="/profile" aria-label="Open your profile" className="active:opacity-90">
          <Avatar
            size="m"
            path={avatarPath}
            name={displayName}
            showActiveDot={hasProviderCommitments(attendance)}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-4 text-muted">{formatGreetingPeriod()}</p>
          <p className="truncate text-xl font-bold leading-7 text-ink">{firstName ?? 'Welcome'}</p>
        </div>
      </div>

      {walletAvailable != null && walletCurrency ? (
        <Link
          href="/wallet"
          aria-label={`Wallet balance ${formatMoney(walletAvailable, walletCurrency)}`}
          className="shrink-0 text-base font-bold text-active active:opacity-90"
        >
          {formatMoney(walletAvailable, walletCurrency)}
        </Link>
      ) : null}
    </div>
  );
}
