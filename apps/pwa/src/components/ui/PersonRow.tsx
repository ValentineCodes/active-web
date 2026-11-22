'use client';

import type { ReactNode } from 'react';

import { IdentityVerifiedBadge } from '@/components/profile/IdentityVerifiedBadge';
import { Avatar } from '@/components/ui/Avatar';
import { StarRating } from '@/components/ui/Stars';
import { cn } from '@/lib/cn';

export function PersonRow({
  avatarPath,
  name,
  ratingAverage,
  ratingCount,
  meta,
  inlineStat,
  identityVerified = false,
  size = 'md',
  trailing,
  onPress,
}: {
  avatarPath: string | null | undefined;
  name: string | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  meta?: string;
  inlineStat?: string;
  identityVerified?: boolean;
  size?: 'sm' | 'md';
  trailing?: ReactNode;
  onPress?: () => void;
}) {
  const showRating = ratingAverage !== undefined && ratingCount !== undefined;
  const showInlineStat = Boolean(inlineStat);
  const showMeta = Boolean(meta && !inlineStat);
  const contentBelowName = showRating || showInlineStat || showMeta;

  const row = (
    <div
      className={cn(
        'flex w-full min-w-0 flex-row gap-3',
        contentBelowName ? 'items-start' : 'items-center',
      )}
    >
      <span className="shrink-0">
        <Avatar path={avatarPath} name={name} size={size} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex max-w-full flex-row items-center gap-1">
          <p className="min-w-0 truncate text-base font-semibold text-ink">{name ?? 'Helper'}</p>
          {identityVerified ? <IdentityVerifiedBadge /> : null}
        </div>
        {showRating || showInlineStat ? (
          <div className="flex flex-row flex-wrap items-center gap-1.5">
            {showRating ? (
              <StarRating average={ratingAverage ?? null} count={ratingCount ?? 0} />
            ) : null}
            {showInlineStat ? (
              <>
                {showRating ? <span className="text-sm text-subtle">·</span> : null}
                <span className="text-sm text-muted">{inlineStat}</span>
              </>
            ) : null}
          </div>
        ) : null}
        {showMeta ? <p className="text-sm text-muted">{meta}</p> : null}
      </div>
      {trailing}
    </div>
  );

  if (!onPress) return row;

  return (
    <button
      type="button"
      className="block w-full min-w-0 border-0 bg-transparent p-0 text-left"
      onClick={onPress}
      aria-label={name ? `View ${name}'s profile` : 'View profile'}
    >
      {row}
    </button>
  );
}
