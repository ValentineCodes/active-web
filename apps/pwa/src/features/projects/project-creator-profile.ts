import type { PersonProfilePreview } from '@/components/profile/PersonProfileSheet';

type ProjectCreatorProfileSource = {
  creator_id: string;
  creator_display_name: string | null;
  creator_avatar_path: string | null;
  creator_bio?: string | null;
  creator_rating_average: number | string | null;
  creator_rating_count: number | string | null;
  creator_completion_percent?: number | string | null;
  creator_identity_verified?: boolean | null;
};

function asFiniteNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function projectCreatorProfileFields(detail: ProjectCreatorProfileSource) {
  const completionPercent = asFiniteNumber(detail.creator_completion_percent);
  return {
    ratingAverage: asFiniteNumber(detail.creator_rating_average),
    ratingCount: asFiniteNumber(detail.creator_rating_count) ?? 0,
    completionPercent: completionPercent != null ? Math.trunc(completionPercent) : null,
    identityVerified: detail.creator_identity_verified ?? false,
  };
}

export function personProfileFromProjectDetail(
  detail: ProjectCreatorProfileSource,
): PersonProfilePreview {
  const fields = projectCreatorProfileFields(detail);
  return {
    userId: detail.creator_id,
    displayName: detail.creator_display_name,
    avatarPath: detail.creator_avatar_path,
    bio: detail.creator_bio,
    ratingAverage: fields.ratingAverage,
    ratingCount: fields.ratingCount,
    completionPercent: fields.completionPercent,
    identityVerified: fields.identityVerified,
  };
}