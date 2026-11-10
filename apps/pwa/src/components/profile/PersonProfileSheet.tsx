'use client';

import { ProfileCompletionBadge } from '@/components/profile/ProfileCompletionBadge';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Avatar } from '@/components/ui/Avatar';
import { StarRating } from '@/components/ui/Stars';

import type { PublicRequest } from '@/features/requests/browse-api';
import type { RespondableRequest } from '@/features/requests/responses-api';

export type PersonProfilePreview = {
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

  return (
    <BottomSheet open={open && profile != null} title={title} onClose={onClose}>
      {profile ? (
        <div className="flex flex-col gap-5">
          <div className="flex min-w-0 flex-row items-start gap-3">
            <Avatar path={profile.avatarPath} name={profile.displayName} size="md" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex max-w-full flex-row items-center gap-1">
                <p className="min-w-0 truncate text-lg font-bold leading-7 text-ink">{title}</p>
                {profile.identityVerified ? (
                  <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">
                    Verified
                  </span>
                ) : null}
              </div>
              <StarRating average={profile.ratingAverage} count={profile.ratingCount ?? 0} size="md" />
            </div>
            {profile.completionPercent != null ? (
              <ProfileCompletionBadge percent={profile.completionPercent} />
            ) : null}
          </div>
          {profile.bio ? <p className="text-base leading-6 text-muted">{profile.bio}</p> : null}
        </div>
      ) : null}
    </BottomSheet>
  );
}
