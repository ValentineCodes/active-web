'use client';

import { Drawer } from 'vaul';

import { ProfileCataloguePreview } from '@/components/profile/ProfileCataloguePreview';
import { ProfileCompletionBadge } from '@/components/profile/ProfileCompletionBadge';
import { VaulSheet } from '@/components/ui/VaulSheet';
import { AvatarWithViewer } from '@/components/profile/AvatarWithViewer';
import { StarRating } from '@/components/ui/Stars';
import { cn } from '@/lib/cn';

import type { PublicRequest } from '@/features/requests/browse-api';
import type { RespondableRequest } from '@/features/requests/responses-api';

export type PersonProfilePreview = {
  userId: string;
  displayName: string | null;
  avatarPath: string | null;
  bio?: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  completionPercent?: number | null;
  identityVerified?: boolean;
};

export function personProfileFromPublicRequest(request: PublicRequest): PersonProfilePreview {
  return {
    userId: request.requester_id,
    displayName: request.requester_display_name,
    avatarPath: request.requester_avatar_path,
    bio: request.requester_bio,
    ratingAverage: request.requester_rating_average,
    ratingCount: request.requester_rating_count,
    completionPercent: request.requester_completion_percent,
    identityVerified: request.requester_identity_verified ?? false,
  };
}

export function personProfileFromRespondableRequest(request: RespondableRequest): PersonProfilePreview {
  return {
    userId: request.requester_id,
    displayName: request.requester_display_name,
    avatarPath: request.requester_avatar_path,
    bio: request.requester_bio,
    ratingAverage: request.requester_rating_average,
    ratingCount: request.requester_rating_count,
    completionPercent: request.requester_completion_percent,
    identityVerified: request.requester_identity_verified ?? false,
  };
}

export function PersonProfileSheet({
  open,
  onClose,
  profile,
}: {
  open: boolean;
  onClose: () => void;
  profile: PersonProfilePreview | null;
}) {
  const title = profile?.displayName?.trim() || 'Profile';
  const hasRatings = (profile?.ratingCount ?? 0) > 0 && profile?.ratingAverage != null;
  const completionPercent =
    profile?.completionPercent != null && Number.isFinite(profile.completionPercent)
      ? Math.trunc(profile.completionPercent)
      : null;

  return (
    <VaulSheet open={open && profile != null} onClose={onClose}>
      {profile ? (
        <div className="flex flex-col gap-5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          <div className="flex min-w-0 flex-row items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-row items-center gap-3">
              <AvatarWithViewer path={profile.avatarPath} name={profile.displayName} size="md" />
              <div className={cn('min-w-0 flex-1', hasRatings ? 'flex flex-col gap-2' : undefined)}>
                <div className="flex max-w-full flex-row items-center gap-1">
                  <p className="min-w-0 truncate text-lg font-bold leading-7 text-ink">{title}</p>
                  {profile.identityVerified ? (
                    <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">
                      Verified
                    </span>
                  ) : null}
                </div>
                {hasRatings ? (
                  <StarRating average={profile.ratingAverage} count={profile.ratingCount ?? 0} size="md" />
                ) : null}
              </div>
            </div>
            {completionPercent != null ? <ProfileCompletionBadge percent={completionPercent} /> : null}
          </div>
          {profile.bio ? <p className="text-base leading-6 text-muted">{profile.bio}</p> : null}
          <ProfileCataloguePreview userId={profile.userId} />
        </div>
      ) : null}
    </VaulSheet>
  );
}